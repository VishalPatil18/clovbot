import { useEffect, useRef, useState } from "react";
import type { Citation, Claim, Headline } from "../api.ts";
import { groupClaims } from "../claims.ts";

const HIGHLIGHT_MS = 5_000;

interface Props {
  turnId: number;
  claims: Claim[];
  citations: Citation[];
  /** Cited chunk id to display number. Falls back to list position if absent. */
  citationNumbers?: Record<string, number>;
  unanswered: string[];
  /** Present only when the answer is a single amount. Absent is the prose path. D-065. */
  headline?: Headline | null;
  /** Plain-language notice that the calendar has passed the plan year. FR-P2-17. */
  staleness?: string | null;
  /** Used when there is no structured payload: refusals and upstream failures. */
  fallback: string;
  /** FR-P3-37. The heading over the source list follows the answer's language. */
  sourcesTitle?: string;
}

/**
 * Renders claims from the structured payload rather than the joined prose, so a
 * claim carries a short marker instead of a hundred characters of provenance.
 * Choosing a marker highlights its source below for five seconds, because a
 * numbered reference is only useful if the eye can find the target.
 */
export function AnswerBody({
  turnId,
  claims,
  citations,
  citationNumbers,
  unanswered,
  headline = null,
  staleness = null,
  fallback,
  sourcesTitle = "Where this comes from",
}: Props): React.JSX.Element {
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear on unmount so a timer cannot fire against a gone component.
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const reveal = (citationId: string): void => {
    // A second choice cancels the first immediately rather than queueing behind it.
    if (timer.current !== null) clearTimeout(timer.current);
    setHighlighted(citationId);
    timer.current = setTimeout(() => setHighlighted(null), HIGHLIGHT_MS);

    const target = document.getElementById(sourceDomId(turnId, citationId));
    target?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    // Moving focus is what makes this work for keyboard and screen-reader users;
    // a colour change alone would reach neither.
    target?.focus({ preventScroll: true });
  };

  if (claims.length === 0) {
    return (
      <>
        {fallback.split("\n").map((line, index) =>
          line.trim().length === 0 ? null : <p key={index}>{line}</p>,
        )}
      </>
    );
  }

  // Position in the list is the source of truth for the number shown, so a
  // server that predates the numbering still renders a usable marker.
  const numberOfSource = new Map(citations.map((citation, index) => [citation.id, citation.number ?? index + 1]));
  const byId = new Map(citations.map((citation) => [citation.id, citation]));
  const targetFor = (citationId: string): { id: string; number: number } | null => {
    const direct = byId.get(citationId);
    if (direct !== undefined) {
      return { id: direct.id, number: numberOfSource.get(direct.id) ?? 1 };
    }
    // Merged duplicate: the claim cites a chunk that shares a source with another.
    const merged = citationNumbers?.[citationId];
    if (merged === undefined) return null;
    const owner = citations.find((citation, index) => (citation.number ?? index + 1) === merged);
    return owner === undefined ? null : { id: owner.id, number: merged };
  };

  return (
    <>
      {headline !== null && (
        <div className="headline">
          {/* The label first: "$10" alone does not say copay, deductible or
              maximum, and a glance at a large number reads it as whichever the
              member was worried about. D-068. */}
          <p className="headline__label">{headline.label}</p>
          <p className="headline__amount">{headline.amount}</p>
        </div>
      )}
      {/* Long answers read as a few labelled parts rather than one run of
          equal sentences. The grouping comes from which claim cites what, a
          fact the payload already carries. */}
      {groupClaims(claims, citations).groups.map((group, groupIndex) => (
        <section key={groupIndex} className="claim-group">
          {group.heading !== null && (
            <h4 className="claim-group__heading">{group.heading}</h4>
          )}
          {group.claims.map((claim, index) => (
        <p key={index} className="claim">
          {claim.text}
          {[...new Set(claim.citationIds.map((id) => targetFor(id)?.id).filter((id): id is string => id !== undefined))].map(
            (sourceId) => {
              const citation = byId.get(sourceId);
              const number = numberOfSource.get(sourceId);
              if (citation === undefined || number === undefined) return null;
              return (
                <button
                  key={sourceId}
                  type="button"
                  className={`cite-marker${highlighted === sourceId ? " cite-marker--active" : ""}`}
                  aria-describedby={sourceDomId(turnId, sourceId)}
                  onClick={() => reveal(sourceId)}
                >
                  <span className="visually-hidden">
                    Show source {number}, {citation.label}
                  </span>
                  <span aria-hidden="true">[{number}]</span>
                </button>
              );
            },
          )}
        </p>
          ))}
        </section>
      ))}

      {unanswered.length > 0 && (
        <div className="gap">
          <p>I could not find this in the plan documents I searched:</p>
          <ul>
            {unanswered.map((gap) => (
              <li key={gap}>{gap}</li>
            ))}
          </ul>
        </div>
      )}

      {citations.length > 0 && (
        <div className="citations">
          <h4 className="citations__title">{sourcesTitle}</h4>
          {/* Attached to the source block, so it survives print, copy and speech
              rather than living in chrome the member may never scroll to. D-067. */}
          {staleness !== null && <p className="citations__staleness">{staleness}</p>}
          <ol className="citations__list">
            {citations.map((citation) => (
              <li
                key={citation.id}
                id={sourceDomId(turnId, citation.id)}
                tabIndex={-1}
                className={`citation${highlighted === citation.id ? " citation--found" : ""}`}
              >
                <span className="citation__number" aria-hidden="true">
                  [{numberOfSource.get(citation.id)}]
                </span>{" "}
                {citation.label}
              </li>
            ))}
          </ol>
        </div>
      )}
    </>
  );
}

const sourceDomId = (turnId: number, citationId: string): string =>
  `src-${turnId}-${citationId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
