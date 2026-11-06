//! macOS can quit an app from the Dock, the app switcher or at logout, and none of those go through
//! the menu. The windowing library doesn't answer macOS's "may I quit?" question, so without this
//! the app would end at once and lose unsaved edits. With nothing unsaved, it lets macOS go ahead,
//! so it never holds up a logout or restart for no reason.

use std::sync::atomic::{AtomicBool, Ordering};

static UNSAVED_WORK: AtomicBool = AtomicBool::new(false);

/// Windows asks through the window's close request, so only macOS reads this.
#[tauri::command]
pub fn set_unsaved_work(unsaved: bool) {
    UNSAVED_WORK.store(unsaved, Ordering::SeqCst);
}

#[cfg(target_os = "macos")]
pub use macos::intercept_termination;

#[cfg(target_os = "macos")]
pub mod macos {
    use std::sync::atomic::Ordering;
    use std::sync::OnceLock;

    use objc2::runtime::{AnyClass, AnyObject, Sel};
    use objc2::{class, msg_send, sel};
    use tauri::{AppHandle, Emitter, Manager};

    use super::UNSAVED_WORK;

    static APP: OnceLock<AppHandle> = OnceLock::new();

    const TERMINATE_CANCEL: usize = 0;
    const TERMINATE_NOW: usize = 1;

    /// The Dock doesn't bring an app forward, and the prompt would otherwise appear out of sight.
    fn bring_forward(app: &AppHandle) -> tauri::Result<()> {
        if let Some(window) = app.get_webview_window("main") {
            window.unminimize()?;
            window.show()?;
            window.set_focus()?;
        }
        Ok(())
    }

    extern "C-unwind" fn should_terminate(_: *mut AnyObject, _: Sel, _: *mut AnyObject) -> usize {
        if !UNSAVED_WORK.load(Ordering::SeqCst) {
            return TERMINATE_NOW;
        }
        let Some(app) = APP.get() else {
            return TERMINATE_NOW;
        };
        if let Err(error) = bring_forward(app) {
            eprintln!("Could not bring the window forward: {error}");
        }
        match app.emit("quit-requested", ()) {
            Ok(()) => TERMINATE_CANCEL,
            Err(error) => {
                // Nothing could ask the person, and refusing would leave no way to quit.
                eprintln!("Could not ask about quitting: {error}");
                TERMINATE_NOW
            }
        }
    }

    fn shared_application() -> *mut AnyObject {
        // SAFETY: `sharedApplication` takes no arguments and always returns the app object.
        unsafe { msg_send![class!(NSApplication), sharedApplication] }
    }

    /// Call once the app has started, when its delegate exists.
    pub fn intercept_termination(app: &AppHandle) {
        if APP.set(app.clone()).is_err() {
            return;
        }
        let application = shared_application();
        // SAFETY: the method's types match the encoding given, which AppKit declares as
        // `NSApplicationTerminateReply applicationShouldTerminate:(NSApplication *)sender`. The
        // class comes from the live delegate, and setup runs on the main thread, as AppKit requires.
        unsafe {
            let delegate: *mut AnyObject = msg_send![application, delegate];
            if delegate.is_null() {
                eprintln!("The app has no delegate, so quitting from the Dock won't ask first.");
                return;
            }
            let class: *const AnyClass = msg_send![delegate, class];
            let implementation: unsafe extern "C-unwind" fn() = std::mem::transmute(
                should_terminate
                    as extern "C-unwind" fn(*mut AnyObject, Sel, *mut AnyObject) -> usize,
            );
            let added = objc2::ffi::class_addMethod(
                class.cast_mut(),
                sel!(applicationShouldTerminate:),
                implementation,
                c"Q@:@".as_ptr().cast(),
            );
            if !added.as_bool() {
                eprintln!("Could not register for quit requests.");
            }
            // AppKit can note what a delegate responds to when it's set, so it's set again.
            let () = msg_send![application, setDelegate: std::ptr::null_mut::<AnyObject>()];
            let () = msg_send![application, setDelegate: delegate];
        }
    }

    /// Lets native tests quit the way the Dock does.
    #[cfg(feature = "e2e")]
    #[tauri::command]
    pub fn e2e_request_terminate(app: AppHandle) -> Result<(), String> {
        app.run_on_main_thread(|| {
            let application = shared_application();
            // SAFETY: `terminate:` accepts a nil sender, and this runs on the main thread.
            let () =
                unsafe { msg_send![application, terminate: std::ptr::null_mut::<AnyObject>()] };
        })
        .map_err(|error| error.to_string())
    }
}
