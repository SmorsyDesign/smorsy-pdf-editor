import { useEffect } from 'react';

/** Keeps the app told whether there's work to lose, so it can hold off a quit. */
export function useReportUnsavedWork(unsaved: boolean, report: (unsaved: boolean) => void): void {
  useEffect(() => {
    report(unsaved);
  }, [unsaved, report]);
  // Closing the document, or a crash, leaves nothing to protect.
  useEffect(
    () => () => {
      report(false);
    },
    [report],
  );
}
