export type MosaicDirection = "row" | "column";

export type MosaicNode<T> = MosaicParent<T> | T;

export interface MosaicParent<T> {
	direction: MosaicDirection;
	first: MosaicNode<T>;
	second: MosaicNode<T>;
	splitPercentage?: number;
}
