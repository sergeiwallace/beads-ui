import type { Dependency } from "@beads-ui/core";

export interface IssueLinksProps {
  dependencies: readonly Dependency[];
  issueHref(id: string): string;
}

/** An issue's links to other issues (its dependencies, by type), each opening that issue. */
export function IssueLinks({ dependencies, issueHref }: IssueLinksProps) {
  if (dependencies.length === 0) return <p className="bu-dim">No links</p>;
  return (
    <ul className="bu-links">
      {dependencies.map((dependency) => (
        <li key={`${dependency.type}:${dependency.id}`} className="bu-link">
          <span className="bu-link-type">{dependency.type}</span>{" "}
          <a href={issueHref(dependency.id)}>{dependency.id}</a>
          {dependency.title !== undefined && <> {dependency.title}</>}
          {dependency.status !== undefined && (
            <span className="bu-dim"> ({dependency.status})</span>
          )}
        </li>
      ))}
    </ul>
  );
}
