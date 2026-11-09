// Frappe Gantt 1.2.2 ships no types; this declares the part the Roadmap uses (src/index.js).
declare module "frappe-gantt" {
  export interface GanttTask {
    id: string;
    name: string;
    /** `YYYY-MM-DD`. */
    start: string;
    end: string;
    /** 0 to 100. */
    progress?: number;
    /** The tasks with an arrow into this one, comma-separated ids. */
    dependencies?: string;
    custom_class?: string;
  }

  export interface GanttOptions {
    view_mode?: "Hour" | "Quarter Day" | "Half Day" | "Day" | "Week" | "Month" | "Year";
    readonly?: boolean;
    popup_on?: "click" | "hover";
    today_button?: boolean;
    scroll_to?: "today" | "start" | "end" | string;
    on_click?: (task: GanttTask) => void;
  }

  export default class Gantt {
    constructor(element: HTMLElement | string, tasks: GanttTask[], options?: GanttOptions);
    refresh(tasks: GanttTask[]): void;
  }
}
