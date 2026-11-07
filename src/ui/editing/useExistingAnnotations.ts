import { useEffect, useRef, useState, type RefObject } from 'react';
import type { Annotation } from '../../engine/edits/annotations';
import { isEncrypted } from '../../engine/extract';
import type { OpenedFile } from '../../platform';
import type { SaveClient } from '../../workers/save-client';

/**
 * The annotations already in an opened file, once they've been read. Call it after whatever sets up
 * the client, because it picks that client up when the file changes.
 */
export function useExistingAnnotations(
  file: OpenedFile | null,
  clientRef: RefObject<Promise<SaveClient> | null>,
  reportProblem: (problem: string) => void,
) {
  const [existing, setExisting] = useState<readonly Annotation[]>([]);
  const [unreadAnnotations, setUnreadAnnotations] = useState(0);
  const existingRef = useRef(existing);
  existingRef.current = existing;

  useEffect(() => {
    setExisting([]);
    setUnreadAnnotations(0);
    const client = clientRef.current;
    // A protected file can't be changed anyway, and comments in it can still be read another way.
    if (!file || !client || isEncrypted(file.bytes)) return;
    let current = true;
    client
      .then((opened) => opened.existingAnnotations())
      .then((found) => {
        if (!current) return;
        setExisting(found.annotations);
        setUnreadAnnotations(found.skipped);
      })
      .catch((error: unknown) => {
        console.error(error);
        if (current) {
          reportProblem(
            'The annotations already in this file couldn’t be read, so they can’t be changed here. They’re still in the file.',
          );
        }
      });
    return () => {
      current = false;
    };
  }, [file, clientRef, reportProblem]);

  return { existing, existingRef, unreadAnnotations };
}
