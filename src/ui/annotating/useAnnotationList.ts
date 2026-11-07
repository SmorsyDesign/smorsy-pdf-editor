import { useEffect, useState } from 'react';
import {
  annotationCategory,
  canTag,
  type Annotation,
  type AnnotationCategory,
} from '../../engine/edits/annotations';
import type { PlacedSignature } from '../../engine/edits/model';
import { allTags } from '../../engine/edits/saved-data';

export type ListScope = 'page' | 'all';
export type ListTab = 'all' | AnnotationCategory;

export type ListItem =
  | { readonly type: 'annotation'; readonly id: string; readonly annotation: Annotation }
  | { readonly type: 'image'; readonly id: string; readonly image: PlacedSignature };

const pageOf = (item: ListItem) =>
  item.type === 'annotation' ? item.annotation.pageNumber : item.image.pageNumber;

function inTab(item: ListItem, tab: ListTab): boolean {
  if (tab === 'all') return true;
  return item.type === 'image' ? tab === 'drawing' : annotationCategory(item.annotation) === tab;
}

function hasTag(item: ListItem, tag: string): boolean {
  if (item.type === 'image' || !canTag(item.annotation)) return false;
  return (item.annotation.tags ?? []).some((one) => one.toLowerCase() === tag.toLowerCase());
}

/** What the panel lists: where from, what kind, and which tag. */
export function useAnnotationList(
  annotations: readonly Annotation[],
  images: readonly PlacedSignature[],
  currentPage: number,
  selected: Annotation | null,
) {
  const [scope, setScope] = useState<ListScope>('page');
  const [tab, setTab] = useState<ListTab>('all');
  const [chosenTag, setChosenTag] = useState<string | null>(null);

  const tags = allTags(annotations);
  // Removing a tag from the last thing that had it leaves nothing to filter by.
  const tag = chosenTag !== null && tags.includes(chosenTag) ? chosenTag : null;

  const everything: readonly ListItem[] = [
    ...annotations.map((annotation): ListItem => ({
      type: 'annotation',
      id: annotation.id,
      annotation,
    })),
    ...images.map((image): ListItem => ({ type: 'image', id: image.id, image })),
  ];
  const inScope = everything.filter((item) => scope === 'all' || pageOf(item) === currentPage);
  const items = inScope
    .filter((item) => inTab(item, tab) && (tag === null || hasTag(item, tag)))
    .sort((one, two) => pageOf(one) - pageOf(two));

  // Something picked on the page has to be in the list, or there'd be nowhere to tag it.
  const selectedId = selected?.id ?? null;
  const selectedIsListed = items.some((item) => item.id === selectedId);
  useEffect(() => {
    if (selectedId === null || selectedIsListed) return;
    setTab('all');
    setChosenTag(null);
  }, [selectedId, selectedIsListed]);

  return {
    scope,
    setScope,
    tab,
    setTab,
    tags,
    tag,
    /** Choosing the tag that's already chosen clears it. */
    toggleTag: (next: string) => {
      setChosenTag((current) => (current === next ? null : next));
    },
    items,
    total: inScope.length,
    pageOf,
  };
}
