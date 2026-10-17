// Change only this actor's membership, preserving concurrent realtime updates.
export function setReactionActor(actors = [], actor, selected) {
  const next = actors.filter(id => id !== actor);
  return selected ? [...next, actor] : next;
}
