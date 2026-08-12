import { useLexicalNodeSelection } from "@lexical/react/useLexicalNodeSelection";
import {
	DecoratorNode,
	type NodeKey,
	type SerializedLexicalNode,
	type Spread,
} from "lexical";
import type { JSX } from "react";
import type { ComposerChip } from "../../types";

function MentionChipComponent({
	nodeKey,
	label,
	brandColor,
	iconUrl,
}: {
	nodeKey: NodeKey;
	label: string;
	brandColor: string | null;
	iconUrl: string | null;
}) {
	const [isSelected] = useLexicalNodeSelection(nodeKey);
	return (
		<span
			className="prompt-input-chip"
			data-mention-chip="true"
			data-selected={isSelected || undefined}
			style={
				brandColor
					? ({ "--chip-color": brandColor } as React.CSSProperties)
					: undefined
			}
		>
			{iconUrl && (
				<span className="prompt-input-chip-icon">
					<img src={iconUrl} alt="" draggable={false} />
				</span>
			)}
			<span className="prompt-input-chip-label">{label}</span>
		</span>
	);
}

export type SerializedMentionChipNode = Spread<
	{
		label: string;
		serialized: string;
		brandColor: string | null;
		iconUrl: string | null;
		dataJson: string | null;
	},
	SerializedLexicalNode
>;

export class MentionChipNode extends DecoratorNode<JSX.Element> {
	__label: string;
	__serialized: string;
	__brandColor: string | null;
	__iconUrl: string | null;
	__dataJson: string | null;

	static getType(): string {
		return "mention-chip";
	}

	static clone(node: MentionChipNode): MentionChipNode {
		return new MentionChipNode(
			node.__label,
			node.__serialized,
			node.__brandColor,
			node.__iconUrl,
			node.__dataJson,
			node.__key,
		);
	}

	constructor(
		label: string,
		serialized: string,
		brandColor: string | null,
		iconUrl: string | null,
		dataJson: string | null,
		key?: NodeKey,
	) {
		super(key);
		this.__label = label;
		this.__serialized = serialized;
		this.__brandColor = brandColor;
		this.__iconUrl = iconUrl;
		this.__dataJson = dataJson;
	}

	static fromChip(chip: ComposerChip): MentionChipNode {
		return new MentionChipNode(
			chip.label,
			chip.serialized,
			chip.brandColor ?? null,
			chip.iconUrl ?? null,
			chip.data === undefined ? null : JSON.stringify(chip.data),
		);
	}

	toChip(): ComposerChip {
		return {
			label: this.__label,
			serialized: this.__serialized,
			brandColor: this.__brandColor ?? undefined,
			iconUrl: this.__iconUrl ?? undefined,
			data: this.__dataJson == null ? undefined : JSON.parse(this.__dataJson),
		};
	}

	static importJSON(serialized: SerializedMentionChipNode): MentionChipNode {
		return new MentionChipNode(
			serialized.label,
			serialized.serialized,
			serialized.brandColor,
			serialized.iconUrl,
			serialized.dataJson,
		);
	}

	exportJSON(): SerializedMentionChipNode {
		return {
			...super.exportJSON(),
			type: "mention-chip",
			label: this.__label,
			serialized: this.__serialized,
			brandColor: this.__brandColor,
			iconUrl: this.__iconUrl,
			dataJson: this.__dataJson,
		};
	}

	createDOM(): HTMLElement {
		return document.createElement("span");
	}

	updateDOM(): boolean {
		return false;
	}

	isInline(): boolean {
		return true;
	}

	getTextContent(): string {
		return this.__serialized;
	}

	decorate(): JSX.Element {
		return (
			<MentionChipComponent
				nodeKey={this.__key}
				label={this.__label}
				brandColor={this.__brandColor}
				iconUrl={this.__iconUrl}
			/>
		);
	}
}
