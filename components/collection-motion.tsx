'use client';
import { Component, createRef, type ReactNode } from 'react';
import type { MembershipChange } from '../lib/membership-motion';
import { durationMilliseconds } from '../lib/motion-duration';
import { pointerMotionAllowed } from '../lib/content-motion';

type Props = {
  ids: string[];
  scene: string;
  layout: string;
  change: MembershipChange | null;
  children: ReactNode;
};
type Position = { rect: DOMRect; opacity: number };
type Exit = { id: string; node: HTMLElement; rect: DOMRect; opacity: number };
type Snapshot = {
  positions: Map<string, Position>;
  exits: Exit[];
  added: Set<string>;
  furniture: Map<HTMLElement, DOMRect>;
  delay: boolean;
};
const visible = (r: DOMRect) => r.bottom > -160 && r.top < innerHeight + 160;

/** getSnapshotBeforeUpdate is required here: measurements must precede React's DOM removal. */
export class CollectionMotion extends Component<Props> {
  private root = createRef<HTMLDivElement>();
  private ghosts = createRef<HTMLDivElement>();
  private animations = new Set<Animation>();
  private handled = new Set<string>();
  private eventKey = 0;
  private version = 0;
  private reduced: MediaQueryList | null = null;
  private cancel = () => {
    this.version++;
    for (const animation of this.animations) animation.cancel();
    this.animations.clear();
    this.ghosts.current?.replaceChildren();
    if (this.root.current) delete this.root.current.dataset.membershipAnimating;
  };
  componentDidMount() {
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)');
    this.reduced.addEventListener('change', this.cancel);
    document.addEventListener('keydown', this.cancel, true);
  }
  componentWillUnmount() {
    this.cancel();
    this.reduced?.removeEventListener('change', this.cancel);
    document.removeEventListener('keydown', this.cancel, true);
  }
  getSnapshotBeforeUpdate(previous: Props): Snapshot | null {
    const change = this.props.change;
    if (
      !this.root.current ||
      previous.scene !== this.props.scene ||
      previous.layout !== this.props.layout ||
      !change?.pointer ||
      !pointerMotionAllowed()
    )
      return null;
    const next = new Set(this.props.ids),
      before = new Set(previous.ids);
    const handled = this.eventKey === change.key ? this.handled : new Set<string>();
    const removed = new Set(
      change.action === 'remove'
        ? previous.ids.filter((id) => !next.has(id) && change.ids.includes(id) && !handled.has(id))
        : [],
    );
    const added = new Set(
      change.action === 'add'
        ? this.props.ids.filter(
            (id) => !before.has(id) && change.ids.includes(id) && !handled.has(id),
          )
        : [],
    );
    // A removal refresh may reveal the next page's films; they join the same local reflow.
    if (change.action === 'remove' && this.animations.size)
      for (const id of this.props.ids) if (!before.has(id)) added.add(id);
    if (!removed.size && !added.size && !this.animations.size) return null;
    this.eventKey = change.key;
    this.handled = new Set([...handled, ...removed, ...added]);
    const positions = new Map<string, Position>(),
      exits: Exit[] = [];
    // Read geometry before cloning/writing; bound work to the visible neighborhood.
    const cards: { node: HTMLElement; rect: DOMRect; opacity: number }[] = [];
    for (const node of this.root.current.querySelectorAll<HTMLElement>(
      '.movie-grid > .movie-card',
    )) {
      const rect = node.getBoundingClientRect();
      if (rect.top > innerHeight + 160) break;
      if (visible(rect))
        cards.push({ node, rect, opacity: Number(getComputedStyle(node).opacity) });
      if (cards.length === 32) break;
    }
    const oldGhosts = [...(this.ghosts.current?.children || [])].map((node) => ({
      node: node as HTMLElement,
      rect: node.getBoundingClientRect(),
      opacity: Number(getComputedStyle(node).opacity),
    }));
    for (const { node, rect, opacity } of cards) {
      const id = node.dataset.movieId!;
      positions.set(id, { rect, opacity });
      if (removed.has(id) && exits.length < 24)
        exits.push({ id, node: node.cloneNode(true) as HTMLElement, rect, opacity });
    }
    for (const { node, rect, opacity } of oldGhosts) {
      const id = node.dataset.ghostMovieId!;
      if (added.has(id)) positions.set(id, { rect, opacity });
      else if (exits.length < 24 && opacity > 0.01)
        exits.push({ id, node: node.cloneNode(true) as HTMLElement, rect, opacity });
    }
    const furniture = new Map<HTMLElement, DOMRect>();
    for (const node of this.root.current
      .closest('.section-content')
      ?.querySelectorAll<HTMLElement>('.load-more, .legend, .site-footer') || [])
      furniture.set(node, node.getBoundingClientRect());
    return {
      positions,
      exits,
      added,
      furniture,
      delay: !!removed.size && !!document.querySelector('dialog[open]'),
    };
  }
  componentDidUpdate(previous: Props, _state: unknown, snapshot: Snapshot | null) {
    if (previous.scene !== this.props.scene || previous.layout !== this.props.layout) {
      this.cancel();
      this.eventKey = this.props.change?.key || 0;
      this.handled = new Set(this.props.change?.ids || []);
      return;
    }
    if (!snapshot) {
      if (
        previous.ids.length !== this.props.ids.length ||
        previous.ids.some((id, i) => id !== this.props.ids[i])
      )
        this.cancel();
      return;
    }
    this.cancel();
    const root = this.root.current!,
      layer = this.ghosts.current!;
    const version = this.version;
    const box = root.getBoundingClientRect();
    const styles = getComputedStyle(document.documentElement);
    const reduce = this.reduced?.matches;
    const duration = durationMilliseconds(styles.getPropertyValue('--dur-view'), 260);
    const exitDuration = durationMilliseconds(styles.getPropertyValue('--dur-medium'), 180);
    const fadeDuration = durationMilliseconds(styles.getPropertyValue('--dur-short'), 120);
    const delay = snapshot.delay ? fadeDuration : 0;
    const easing = styles.getPropertyValue('--ease-out').trim();
    const cards: { node: HTMLElement; rect: DOMRect }[] = [];
    for (const node of root.querySelectorAll<HTMLElement>('.movie-grid > .movie-card')) {
      const rect = node.getBoundingClientRect();
      if (rect.top > innerHeight + 160) break;
      if (visible(rect)) cards.push({ node, rect });
      if (cards.length === 32) break;
    }
    const furniture = [...snapshot.furniture]
      .filter(([node]) => node.isConnected)
      .map(([node, before]) => ({ node, before, after: node.getBoundingClientRect() }));
    const empty = root.querySelector<HTMLElement>('.empty-state');
    function frame(position: Position, target: DOMRect): Keyframe {
      return {
        opacity: position.opacity,
        transform: `translate(${position.rect.left - target.left}px, ${position.rect.top - target.top}px) scale(${position.rect.width / target.width})`,
      };
    }
    const play = (node: HTMLElement, frames: Keyframe[], time: number) => {
      const animation = node.animate(frames, { duration: time, easing, delay, fill: 'backwards' });
      this.animations.add(animation);
      void animation.finished.catch(() => {});
    };
    root.dataset.membershipAnimating = 'true';
    for (const { node, rect } of cards) {
      const id = node.dataset.movieId!,
        origin = snapshot.positions.get(id);
      if (snapshot.added.has(id)) {
        node.style.transformOrigin = 'top left';
        play(
          node,
          [
            reduce
              ? { opacity: 0 }
              : origin
                ? frame(origin, rect)
                : { opacity: 0, transform: 'translateY(8px) scale(0.97)' },
            { opacity: 1, transform: 'none' },
          ],
          reduce ? fadeDuration : duration,
        );
      } else if (
        origin &&
        ((!reduce &&
          (Math.abs(origin.rect.left - rect.left) > 1 ||
            Math.abs(origin.rect.top - rect.top) > 1 ||
            Math.abs(origin.rect.width - rect.width) > 1)) ||
          origin.opacity < 0.99)
      ) {
        node.style.transformOrigin = 'top left';
        play(
          node,
          [
            reduce ? { opacity: origin.opacity } : frame(origin, rect),
            { opacity: 1, transform: 'none' },
          ],
          reduce ? fadeDuration : duration,
        );
      }
    }
    for (const { id, node, rect, opacity } of snapshot.exits) {
      node.removeAttribute('data-movie-id');
      node.dataset.ghostMovieId = id;
      node.classList.add('membership-ghost');
      node.inert = true;
      node.setAttribute('aria-hidden', 'true');
      for (const element of [node, ...node.querySelectorAll('[id]')]) element.removeAttribute('id');
      Object.assign(node.style, {
        position: 'absolute',
        left: `${rect.left - box.left}px`,
        top: `${rect.top - box.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        margin: '0',
        opacity: String(opacity),
        transform: 'none',
        transformOrigin: 'center',
      });
      layer.append(node);
      play(
        node,
        [
          { opacity, transform: 'none' },
          reduce ? { opacity: 0 } : { opacity: 0, transform: 'translateY(4px) scale(0.96)' },
        ],
        reduce ? fadeDuration : exitDuration,
      );
    }
    for (const { node, before, after } of furniture) {
      if (!reduce && Math.abs(before.top - after.top) > 1)
        play(
          node,
          [{ transform: `translateY(${before.top - after.top}px)` }, { transform: 'none' }],
          duration,
        );
    }
    if (empty && snapshot.exits.length)
      play(empty, [{ opacity: 0 }, { opacity: 1 }], reduce ? fadeDuration : duration);
    void Promise.allSettled([...this.animations].map((animation) => animation.finished)).then(
      () => {
        if (this.version === version) this.cancel();
      },
    );
  }
  render() {
    return (
      <div ref={this.root} className="collection-motion-root">
        {this.props.children}
        <div
          ref={this.ghosts}
          className={`membership-ghost-layer ${this.props.layout === 'list' ? 'movie-list' : ''}`}
          aria-hidden="true"
          inert
        />
      </div>
    );
  }
}
