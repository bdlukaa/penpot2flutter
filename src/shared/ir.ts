export type DiagnosticSeverity = "warning" | "error";

export interface Diagnostic {
  readonly severity: DiagnosticSeverity;
  readonly sourceId: string;
  readonly code: string;
  readonly message: string;
}

export type IrTokenType =
  | "color"
  | "dimension"
  | "spacing"
  | "sizing"
  | "border-width"
  | "border-radius"
  | "opacity"
  | "typography"
  | "font-family"
  | "font-size"
  | "font-weight"
  | "line-height"
  | "letter-spacing"
  | "shadow"
  | "gradient"
  | "duration"
  | "number"
  | "unknown";

export interface IrTypographyTokenValue {
  readonly fontFamily?: string;
  readonly fontSize?: number;
  readonly fontWeight?: number;
  readonly lineHeight?: number;
  readonly letterSpacing?: number;
  readonly color?: string;
}

export type IrTokenValue = string | number | IrTypographyTokenValue | readonly DropShadow[] | GradientFill;

export interface IrToken {
  readonly id: string;
  readonly sourceName: string;
  readonly path: readonly string[];
  readonly type: IrTokenType;
  readonly value: IrTokenValue;
  readonly rawValue?: unknown;
  readonly aliasTargetId?: string;
  readonly setId?: string;
  readonly dartClass: string;
  readonly dartName: string;
}

export interface IrTokenReference {
  readonly property: string;
  readonly tokenId: string;
}

export interface IrTokenSet {
  readonly id: string;
  readonly name: string;
  readonly tokenIds: readonly string[];
}

export interface IrTokenTheme {
  readonly id: string;
  readonly name: string;
  readonly enabledSets: readonly string[];
}

export interface ColorFill {
  readonly color: string;
  readonly opacity: number;
}

export interface GradientStop extends ColorFill {
  readonly offset: number;
}

export interface GradientFill {
  readonly type: "linear" | "radial";
  readonly startX: number;
  readonly startY: number;
  readonly endX: number;
  readonly endY: number;
  readonly width: number;
  readonly stops: readonly GradientStop[];
}

export interface ImageFill {
  readonly assetPath: string;
  readonly keepAspectRatio: boolean;
}

export interface AssetManifestEntry {
  readonly id: string;
  readonly name?: string;
  readonly mimeType?: string;
  readonly width: number;
  readonly height: number;
  readonly path: string;
}

export interface Border {
  readonly color: string;
  readonly opacity: number;
  readonly width: number;
}

export interface CornerRadii {
  readonly topLeft: number;
  readonly topRight: number;
  readonly bottomRight: number;
  readonly bottomLeft: number;
}

export interface DropShadow {
  readonly color: string;
  readonly opacity: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly blur: number;
  readonly spread: number;
}

export interface NodeStyle {
  readonly fill?: ColorFill;
  readonly gradient?: GradientFill;
  readonly image?: ImageFill;
  readonly border?: Border;
  readonly radius?: CornerRadii;
  readonly shadows?: readonly DropShadow[];
  readonly opacity: number;
}

export interface NodeGeometry {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface NodeTransform {
  readonly rotation: number;
  readonly flipX: boolean;
  readonly flipY: boolean;
}

export type IrTextDecoration = "underline" | "line-through";
export type IrTextTransform = "uppercase" | "lowercase" | "capitalize";

export interface IrTypographyStyle {
  readonly id: string;
  readonly name: string;
  readonly fontFamily?: string;
  readonly fallbackFamilies?: readonly string[];
  readonly fontSize?: number;
  readonly fontWeight?: number;
  readonly fontStyle?: "normal" | "italic";
  /** Flutter line-height multiplier. */
  readonly lineHeight?: number;
  readonly letterSpacing?: number;
  readonly decoration?: IrTextDecoration;
  readonly color?: ColorFill;
}

export interface TextStyle {
  readonly fontFamily?: string;
  readonly fallbackFamilies?: readonly string[];
  readonly fontSize?: number;
  readonly fontWeight?: number;
  readonly fontStyle?: "normal" | "italic";
  readonly lineHeight?: number;
  readonly letterSpacing?: number;
  readonly decoration?: IrTextDecoration;
  readonly color?: ColorFill;
  readonly align?: "left" | "center" | "right" | "justify";
}

export interface IrFontManifestEntry {
  readonly family: string;
  readonly fallbackFamilies: readonly string[];
  readonly weights: readonly number[];
  readonly styles: readonly ("normal" | "italic")[];
  readonly available: boolean;
  readonly assets: readonly IrFontAsset[];
}

export interface IrFontAsset {
  readonly path: string;
  readonly weight: number;
  readonly style: "normal" | "italic";
}

export interface TextRun {
  readonly text: string;
  readonly style: TextStyle;
  readonly typographyStyleId?: string;
  readonly textTransform?: IrTextTransform;
  readonly children?: readonly TextRun[];
}

export type FlexDirection = "row" | "row-reverse" | "column" | "column-reverse";
export type FlexAlignment = "start" | "end" | "center" | "stretch";
export type FlexJustification = "start" | "end" | "center" | "space-between" | "space-around" | "space-evenly" | "stretch";
export type LayoutSizing = "auto" | "fill" | "fix";
export type GridTrackType = "flex" | "fixed" | "percent" | "auto";

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

export interface GridTrack {
  readonly type: GridTrackType;
  readonly value?: number;
}

export interface GridLayout {
  readonly direction: "row" | "column";
  readonly rows: readonly GridTrack[];
  readonly columns: readonly GridTrack[];
  readonly rowGap: number;
  readonly columnGap: number;
  readonly padding: EdgeInsets;
  readonly supported: boolean;
}

export interface LayoutChild {
  readonly absolute: boolean;
  readonly horizontalSizing: LayoutSizing;
  readonly verticalSizing: LayoutSizing;
  readonly minWidth?: number;
  readonly maxWidth?: number;
  readonly minHeight?: number;
  readonly maxHeight?: number;
  readonly aspectRatio?: number;
}

export interface BaseNode {
  readonly sourceId: string;
  readonly sourceName: string;
  readonly name: string;
  readonly geometry: NodeGeometry;
  readonly visible: boolean;
  readonly style: NodeStyle;
  readonly transform?: NodeTransform;
  readonly layoutChild?: LayoutChild;
  readonly diagnostics: readonly Diagnostic[];
  readonly tokenReferences?: readonly IrTokenReference[];
}

export interface BoardNode extends BaseNode {
  readonly kind: "board";
  readonly clipContent: boolean;
  readonly flex?: FlexLayout;
  readonly grid?: GridLayout;
  readonly children: readonly IrNode[];
}

export interface GroupNode extends BaseNode {
  readonly kind: "group";
  readonly children: readonly IrNode[];
}

export interface RectangleNode extends BaseNode {
  readonly kind: "rectangle";
}

export interface EllipseNode extends BaseNode {
  readonly kind: "ellipse";
}

export interface ImageNode extends BaseNode {
  readonly kind: "image";
}

export interface SvgNode extends BaseNode {
  readonly kind: "svg";
  readonly assetPath: string;
}

export interface TextNode extends BaseNode {
  readonly kind: "text";
  readonly text: string;
  readonly textStyle: TextStyle;
  readonly typographyStyleId?: string;
  readonly textTransform?: IrTextTransform;
  readonly verticalAlign?: "top" | "center" | "bottom";
  readonly maxLines?: number;
  readonly overflow?: "ellipsis" | "clip" | "fade" | "visible";
  readonly softWrap?: boolean;
  readonly runs?: readonly TextRun[];
  readonly parameterName?: string;
}

export interface UnsupportedNode extends BaseNode {
  readonly kind: "unsupported";
  readonly sourceType: string;
}

export type ComponentParameterType = "String";

export interface IrComponentParameter {
  readonly name: string;
  readonly type: ComponentParameterType;
  readonly defaultValue?: string;
}

export interface IrArgument {
  readonly name: string;
  readonly value: string;
}

export interface IrVariantValue {
  readonly sourceValue: string;
  readonly name: string;
}

export interface IrVariantAxis {
  readonly sourceName: string;
  readonly name: string;
  readonly enumName: string;
  readonly values: readonly IrVariantValue[];
  readonly defaultValue: string;
}

export interface IrVariantSelection {
  readonly axisName: string;
  readonly enumName: string;
  readonly valueName: string;
}

export interface IrVariantMember {
  readonly componentId: string;
  readonly values: readonly IrVariantSelection[];
  readonly root: IrNode;
}

export interface IrVariantFamily {
  readonly id: string;
  readonly sourceName: string;
  readonly axes: readonly IrVariantAxis[];
  readonly members: readonly IrVariantMember[];
}

export interface IrComponentInstanceNode extends BaseNode {
  readonly kind: "component-instance";
  readonly componentId: string;
  readonly variantValues?: readonly IrVariantSelection[];
  readonly arguments: readonly IrArgument[];
}

export interface IrComponentDefinition {
  /** Composite `${libraryId}:${componentId}` identity used for references and dependencies. */
  readonly id: string;
  readonly sourceComponentId: string;
  readonly sourceName: string;
  readonly name: string;
  readonly sourceLibraryId?: string;
  readonly root: IrNode;
  readonly variant?: IrVariantFamily;
  readonly parameters: readonly IrComponentParameter[];
  readonly dependencies: readonly string[];
}

export type IrNode = BoardNode | GroupNode | RectangleNode | EllipseNode | ImageNode | SvgNode | TextNode | IrComponentInstanceNode | UnsupportedNode;

export interface IrResponsiveVariant {
  readonly minWidth?: number;
  readonly maxWidth?: number;
  readonly root: IrNode;
  readonly sourceBoardId: string;
  readonly sourceName: string;
}

export interface IrResponsiveScreen {
  readonly id: string;
  readonly name: string;
  readonly variants: readonly IrResponsiveVariant[];
}

export interface ConversionResult {
  readonly root: IrNode;
  readonly responsiveScreen?: IrResponsiveScreen;
  readonly assets: readonly AssetManifestEntry[];
  readonly diagnostics: readonly Diagnostic[];
  readonly components: readonly IrComponentDefinition[];
  readonly tokens: readonly IrToken[];
  readonly tokenSets: readonly IrTokenSet[];
  readonly tokenThemes: readonly IrTokenTheme[];
  readonly typographyStyles: readonly IrTypographyStyle[];
  readonly fonts: readonly IrFontManifestEntry[];
}

export interface GeneratedFile {
  readonly path: string;
  readonly source: string;
}
