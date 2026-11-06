import { EditNote, ProblemNote, needsFontCard } from './Notices';
import type { DocumentEditor } from './useDocumentEditor';
import type { TextSession } from './useTextSession';

/** Notes about the latest edit, stacked so two can show at once without overlapping. */
export function EditToasts({ editor, session }: { editor: DocumentEditor; session: TextSession }) {
  const { notice, problem } = editor;
  const showNote = notice !== null && !needsFontCard(notice);
  return (
    <div className="toast-stack">
      {problem && (
        <ProblemNote
          message={problem}
          onDismiss={() => {
            editor.reportProblem(null);
          }}
        />
      )}
      {showNote && (
        <EditNote
          notice={notice}
          showCovered={session.showCovered}
          showSameWidths={session.showSameWidths}
          onDismiss={session.dismissNotice}
        />
      )}
    </div>
  );
}
