export type DiagnosticSeverity = "warning" | "error";

export interface Diagnostic {
  readonly severity: DiagnosticSeverity;
  readonly sourceId: string;
  readonly code: string;
  readonly message: string;
}

export interface ColorFill {
  readonly color: string;
  readonly opacity: number;
}

export interface NodeStyle {
  readonly fill?: ColorFill;
  readonly opacity: number;
}

export interface NodeGeometry {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface TextStyle {
  readonly fontFamily?: string;
  readonly fontSize?: number;
  readonly fontWeight?: number;
  readonly lineHeight?: number;
  readonly letterSpacing?: number;
  readonly align?: "left" | "center" | "right" | "justify";
}

export type FlexDirection = "row" | "row-reverse" | "column" | "column-reverse";
export type FlexAlignment = "start" | "end" | "center" | "stretch";
export type FlexJustification =
  | "start"
  | "end"
  | "center"
  | "space-between"
  | "space-around"
  | "space-evenly"
  | "stretch";
export type LayoutSizing = "auto" | "fill" | "fix";

export interface EdgeInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface FlexLayout {
  readonly direction: FlexDirection;
  readonly rowGap: number;
  readonly columnGap: number;
  readonly padding: EdgeInsets;
  readonly justifyContent?: FlexJustification;
  readonly alignItems?: FlexAlignment;
}

export interface LayoutChild {
  readonly absolute: boolean;
  readonly horizontalSizing: LayoutSizing;
  readonly verticalSizing: LayoutSizing;
}

export interface BaseNode {
  readonly sourceId: string;
  readonly name: string;
  readonly geometry: NodeGeometry;
  readonly visible: boolean;
  readonly style: NodeStyle;
  readonly layoutChild?: LayoutChild;
  readonly diagnostics: readonly Diagnostic[];
}

export interface BoardNode extends BaseNode {
  readonly kind: "board";
  readonly clipContent: boolean;
  readonly flex?: FlexLayout;
  readonly children: readonly IrNode[];
}

export interface GroupNode extends BaseNode {
  readonly kind: "group";
  readonly children: readonly IrNode[];
}

export interface RectangleNode extends BaseNode {
  readonly kind: "rectangle";
}

export interface TextNode extends BaseNode {
  readonly kind: "text";
  readonly text: string;
  readonly textStyle: TextStyle;
}

export interface UnsupportedNode extends BaseNode {
  readonly kind: "unsupported";
  readonly sourceType: string;
}

export type IrNode = BoardNode | GroupNode | RectangleNode | TextNode | UnsupportedNode;

export interface ConversionResult {
  readonly root: IrNode;
  readonly diagnostics: readonly Diagnostic[];
}
