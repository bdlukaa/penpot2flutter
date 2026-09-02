export type DiagnosticSeverity = "info" | "warning" | "error" | "design-recommendation";

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
  | "rotation"
  | "typography"
  | "font-family"
  | "font-size"
  | "font-weight"
  | "line-height"
  | "letter-spacing"
  | "text-case"
  | "text-decoration"
  | "shadow"
  | "gradient"
  | "duration"
  | "number"
  | "unknown";

export interface IrTypographyTokenValue {
  readonly fontFamily?: string;
  readonly fontFamilyFallbacks?: readonly string[];
  readonly fontSize?: number;
  readonly fontWeight?: number;
  readonly lineHeight?: number;
  readonly letterSpacing?: number;
  readonly color?: string;
}

export type IrTokenValue = string | number | IrTypographyTokenValue | readonly DropShadow[] | GradientFill;

export type IrLibraryScope = "local" | "shared";

/** Serializable identity metadata captured from Penpot's read-only library API. */
export interface IrLibrarySource {
  readonly id: string;
  readonly name: string;
  readonly scope: IrLibraryScope;
  /** Preserved only when the Penpot API exposes an actual library revision. */
  readonly sourceRevision?: string;
}

/** A deterministic registry entry for a local or connected Penpot library. */
export interface IrLibrary extends IrLibrarySource {
  readonly components: readonly string[];
  readonly tokenSets: readonly string[];
  readonly assets: readonly string[];
  readonly dependencies: readonly string[];
}

export interface IrToken {
  readonly id: string;
  readonly sourceLibraryId?: string;
  readonly sourceLibraryScope?: IrLibraryScope;
  readonly identity?: { readonly tokenId: string; readonly setId: string };
  readonly sourceName: string;
  readonly path: readonly string[];
  readonly type: IrTokenType;
  readonly value: IrTokenValue;
  readonly rawValue?: unknown;
  readonly resolvedValue?: IrTokenValue;
  readonly sourceType?: string;
  readonly setName?: string;
  readonly fontFamilyFallbacks?: readonly string[];
  readonly references: readonly string[];
  readonly dependencies?: readonly string[];
  readonly aliasTargetId?: string;
  readonly setId?: string;
  readonly setIndex?: number;
  readonly dartClass: string;
  readonly dartName: string;
}

export interface IrTokenReference {
  readonly property: string;
  readonly sourceLibraryId?: string;
  readonly sourceLibraryScope?: IrLibraryScope;
  /** Penpot applies tokens by semantic name, not by definition id. */
  readonly tokenName: string;
  readonly tokenId?: string;
  readonly tokenSetId?: string;
  /** Original semantic token path, preserved independently from its fallback value. */
  readonly tokenPath: readonly string[];
  readonly tokenType?: IrTokenType;
  readonly resolvedValue?: IrTokenValue;
}

export interface IrTokenSet {
  readonly id: string;
  readonly sourceLibraryId?: string;
  readonly sourceLibraryScope?: IrLibraryScope;
  readonly name: string;
  readonly index: number;
  readonly active: boolean;
  readonly tokenIds: readonly string[];
}

export interface IrTokenTheme {
  readonly id: string;
  readonly sourceLibraryId?: string;
  readonly sourceLibraryScope?: IrLibraryScope;
  readonly externalId?: string;
  readonly name: string;
  readonly group: string;
  readonly active: boolean;
  readonly activeSetIds: readonly string[];
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

export type IrAssetType = "svg" | "png" | "jpg" | "webp" | "font";

/** A stable, reusable asset declaration emitted by the conversion pipeline. */
export interface IrAsset {
  readonly id: string;
  readonly sourceNodeId: string;
  readonly sourceLibraryId?: string;
  readonly sourceLibraryScope?: IrLibraryScope;
  readonly type: IrAssetType;
  /** Project-relative path, including the `assets/` directory. */
  readonly filename: string;
  readonly contentHash?: string;
  readonly dimensions?: {
    readonly width: number;
    readonly height: number;
  };
}

/**
 * Legacy asset shape kept for callers that only consume the pubspec snippet.
 * New project generation uses `ConversionResult.assetRegistry` and `IrAsset`.
 */
export interface AssetManifestEntry {
  readonly id: string;
  readonly name?: string;
  readonly mimeType?: string;
  readonly width: number;
  readonly height: number;
  readonly path: string;
}

export type ImageFit = "cover" | "contain" | "fill" | "fitWidth" | "fitHeight" | "none" | "scaleDown";
export type ImageAlignment = "topLeft" | "topCenter" | "topRight" | "centerLeft" | "center" | "centerRight" | "bottomLeft" | "bottomCenter" | "bottomRight";

export interface ImageFill {
  readonly assetPath: string;
  readonly assetId?: string;
  readonly keepAspectRatio: boolean;
  readonly fit?: ImageFit;
  readonly alignment?: ImageAlignment;
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
  readonly blur?: number;
  readonly backgroundBlur?: number;
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
  readonly wrap?: boolean;
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
  readonly sourceLibraryId?: string;
  readonly sourceLibraryScope?: IrLibraryScope;
  readonly name: string;
  readonly geometry: NodeGeometry;
  readonly visible: boolean;
  readonly style: NodeStyle;
  readonly transform?: NodeTransform;
  readonly layoutChild?: LayoutChild;
  readonly diagnostics: readonly Diagnostic[];
  readonly fillParameterName?: string;
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
  readonly assetId?: string;
  readonly assetType?: "svg" | "png" | "jpg" | "webp";
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

export type ComponentParameterType = "String" | "Color";

export interface IrComponentParameter {
  readonly name: string;
  readonly type: ComponentParameterType;
  readonly defaultValue?: string;
}

export interface IrArgument {
  readonly name: string;
  readonly value: string;
  readonly type?: ComponentParameterType;
  readonly tokenId?: string;
  readonly tokenSetId?: string;
  readonly tokenPath?: readonly string[];
  readonly tokenType?: IrTokenType;
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
  readonly dartName?: string;
}

export interface IrVariantFamily {
  readonly id: string;
  readonly sourceName: string;
  readonly axes: readonly IrVariantAxis[];
  readonly members: readonly IrVariantMember[];
  readonly representation?: "axes" | "members";
  readonly enumName?: string;
  readonly defaultMemberName?: string;
}

export interface IrComponentInstanceNode extends BaseNode {
  readonly kind: "component-instance";
  readonly componentId: string;
  readonly variantValues?: readonly IrVariantSelection[];
  readonly variantMemberName?: string;
  readonly arguments: readonly IrArgument[];
}

export interface IrComponentDefinition {
  /** Composite `${libraryId}:${componentId}` identity used for references and dependencies. */
  readonly id: string;
  readonly sourceComponentId: string;
  readonly sourceName: string;
  readonly name: string;
  readonly sourceLibraryId?: string;
  readonly sourceLibraryScope?: IrLibraryScope;
  readonly root: IrNode;
  readonly interactions: readonly IrInteraction[];
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

export type IrInteractionKind = "navigate" | "back" | "open-overlay" | "toggle-overlay" | "close-overlay" | "open-url";
export type IrInteractionTrigger = "click" | "mouse-enter" | "mouse-leave" | "after-delay";

export interface IrPrototypeAnimation {
  readonly type: "dissolve" | "slide" | "push";
  readonly durationMs: number;
  readonly easing?: "linear" | "ease" | "ease-in" | "ease-out" | "ease-in-out";
  readonly direction?: "right" | "left" | "up" | "down";
  readonly way?: "in" | "out";
}

export interface IrOverlayOptions {
  readonly position?: "manual" | "center" | "top-left" | "top-right" | "top-center" | "bottom-left" | "bottom-right" | "bottom-center";
  /** Stable Penpot source node ID used as the overlay placement anchor. */
  readonly relativeToSourceId?: string;
  /** Penpot's explicit page-space overlay location for manual placement. */
  readonly manualPosition?: { readonly x: number; readonly y: number };
  readonly closeWhenClickOutside?: boolean;
  readonly addBackgroundOverlay?: boolean;
}

export interface IrInteraction {
  readonly id: string;
  readonly sourceNodeId: string;
  readonly trigger: IrInteractionTrigger;
  readonly kind: IrInteractionKind;
  readonly targetId?: string;
  readonly delayMs?: number;
  readonly url?: string;
  readonly preserveScrollPosition?: boolean;
  readonly animation?: IrPrototypeAnimation;
  readonly overlay?: IrOverlayOptions;
}

export interface IrPrototypeDestination {
  readonly id: string;
  readonly name: string;
}

export interface IrPrototypeFlowEntry {
  readonly id: string;
  readonly name: string;
  readonly destinationId: string;
}

/** Low-authority Penpot flow hints. Application routing remains developer-owned. */
export interface IrPrototypeMetadata {
  readonly destinations: readonly IrPrototypeDestination[];
  readonly interactions: readonly IrInteraction[];
  readonly flows: readonly IrPrototypeFlowEntry[];
  readonly overlayDestinationIds: readonly string[];
}

export interface IrQualitySummary {
  readonly errors: number;
  readonly warnings: number;
  readonly information: number;
  readonly recommendations: number;
}

export interface ConversionResult {
  readonly root: IrNode;
  readonly qualitySummary?: IrQualitySummary;
  readonly responsiveScreen?: IrResponsiveScreen;
  readonly prototypeMetadata?: IrPrototypeMetadata;
  /** Legacy metadata projection. Prefer `assetRegistry` for generated projects. */
  readonly assets: readonly AssetManifestEntry[];
  readonly assetRegistry: readonly IrAsset[];
  readonly diagnostics: readonly Diagnostic[];
  readonly components: readonly IrComponentDefinition[];
  readonly tokens: readonly IrToken[];
  readonly tokenSets: readonly IrTokenSet[];
  readonly tokenThemes: readonly IrTokenTheme[];
  readonly typographyStyles: readonly IrTypographyStyle[];
  readonly fonts: readonly IrFontManifestEntry[];
  /** Local and shared library ownership remains available after extraction. */
  readonly libraries: readonly IrLibrary[];
}

export type GeneratedArtifactTier = "design-system" | "design-composition" | "prototype-metadata" | "manifest";

export interface GeneratedFile {
  readonly path: string;
  readonly source: string;
  readonly tier?: GeneratedArtifactTier;
  readonly sourceIds?: readonly string[];
}
