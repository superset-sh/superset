export type MosaicNode<T> =
	| {
			direction: "row" | "column";
			first: MosaicNode<T>;
			second: MosaicNode<T>;
			splitPercentage?: number;
	  }
	| T;
