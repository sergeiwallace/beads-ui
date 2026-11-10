import { type Comment, type Issue, priorityBadge, priorityToken } from "@beads-ui/core";
import type { ReactNode } from "react";
import { IssueLinks } from "./detail/IssueLinks.tsx";
import { Markdown } from "./detail/Markdown.tsx";
import { tokenVar } from "./tokens.ts";

/** A read that failed, named by what failed (`bd show`, `bd comments`). */
export interface ReadFailure {
  source: string;
  message: string;
}

export interface IssueDetailProps {
  loading: boolean;
  issue?: Issue | undefined;
  /** The repository of the store the issue was read from, or the one the page asked. */
  repository?: string | undefined;
  /** Why the issue itself could not be read; the fields are not drawn. */
  issueError?: ReadFailure | undefined;
  comments: readonly Comment[] | null;
  /** Why the comments could not be read; said in their place, never shown as no comments. */
  commentsError?: ReadFailure | undefined;
  issueHref(id: string): string;
  /** The owner picker, drawn beside the assignee (T-W1.0). */
  ownerPicker?: ReactNode | undefined;
}

const NOT_SET = "not set";

function Failure({ failure, store }: { failure: ReadFailure; store?: string | undefined }) {
  return (
    <p className="bu-read-error" role="alert">
      <strong>{failure.source}</strong> failed{store === undefined ? "" : ` in ${store}`}:{" "}
      {failure.message}
    </p>
  );
}

function date(value: string | undefined): string {
  return value === undefined ? NOT_SET : value.slice(0, 16).replace("T", " ");
}

/**
 * One issue's fields, description, comments and links, each read from the issue's own store; the
 * description and comments drawn as Markdown with no raw HTML (web app design T-W1.7).
 */
export function IssueDetail(props: IssueDetailProps) {
  const { issue } = props;
  if (props.issueError !== undefined) {
    return (
      <article className="bu-detail">
        <Failure failure={props.issueError} store={props.repository} />
      </article>
    );
  }
  if (issue === undefined) {
    return <article className="bu-detail" aria-busy={props.loading} />;
  }
  const fields: [string, ReactNode][] = [
    ...(props.repository === undefined
      ? []
      : ([["Repository", props.repository]] as [string, ReactNode][])),
    ["Type", issue.type],
    ["Status", issue.status],
    [
      "Priority",
      <span key="p" style={{ color: tokenVar(priorityToken(issue.priority)) }}>
        {priorityBadge(issue.priority)}
      </span>,
    ],
    ["Assignee", props.ownerPicker ?? issue.assignee ?? NOT_SET],
    ["Owner", issue.owner ?? NOT_SET],
    ["Labels", issue.labels.length === 0 ? "none" : issue.labels.join(", ")],
    [
      "Parent",
      issue.parent === undefined ? (
        "none"
      ) : (
        <a key="parent" href={props.issueHref(issue.parent)}>
          {issue.parent}
        </a>
      ),
    ],
    ["Created", date(issue.createdAt)],
    ["Updated", date(issue.updatedAt)],
    ...(issue.startedAt === undefined
      ? []
      : ([["Started", date(issue.startedAt)]] as [string, ReactNode][])),
    ...(issue.dueAt === undefined ? [] : ([["Due", date(issue.dueAt)]] as [string, ReactNode][])),
    ["Closed", issue.closedAt === undefined ? "open" : date(issue.closedAt)],
  ];
  return (
    <article className="bu-detail" aria-labelledby="bu-detail-title">
      <p className="bu-id">{issue.displayId ?? issue.id}</p>
      <h1 id="bu-detail-title" className="bu-detail-title">
        {issue.title}
      </h1>
      <dl className="bu-fields">
        {fields.map(([label, value]) => (
          <div key={label} className="bu-field">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <section aria-labelledby="bu-description">
        <h2 id="bu-description">Description</h2>
        {issue.description === undefined ? (
          <p className="bu-dim">No description</p>
        ) : (
          <Markdown text={issue.description} className="bu-description" />
        )}
      </section>
      <section aria-labelledby="bu-links">
        <h2 id="bu-links">Links</h2>
        <IssueLinks dependencies={issue.dependencies} issueHref={props.issueHref} />
      </section>
      <section aria-labelledby="bu-comments">
        <h2 id="bu-comments">Comments</h2>
        {props.commentsError !== undefined ? (
          <Failure failure={props.commentsError} store={props.repository} />
        ) : props.comments === null ? (
          <p className="bu-dim" aria-busy="true">
            Reading comments
          </p>
        ) : props.comments.length === 0 ? (
          <p className="bu-dim">No comments</p>
        ) : (
          <ol className="bu-comments">
            {props.comments.map((comment) => (
              <li key={comment.id} className="bu-comment">
                <p className="bu-comment-head">
                  <strong>{comment.author}</strong>{" "}
                  <span className="bu-dim">{date(comment.createdAt)}</span>
                </p>
                <Markdown text={comment.text} className="bu-comment-body" />
              </li>
            ))}
          </ol>
        )}
      </section>
    </article>
  );
}
