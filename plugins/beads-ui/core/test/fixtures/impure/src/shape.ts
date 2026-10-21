export interface Shape {
  label: string;
}

export const describe = (shape: Shape & Record<string, number>): string =>
  `${shape.label}: ${shape.window} ${shape.process}`;
