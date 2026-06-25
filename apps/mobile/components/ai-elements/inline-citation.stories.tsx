import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import {
	InlineCitation,
	InlineCitationCard,
	InlineCitationCardBody,
	InlineCitationCardTrigger,
	InlineCitationCarousel,
	InlineCitationCarouselContent,
	InlineCitationCarouselHeader,
	InlineCitationCarouselIndex,
	InlineCitationCarouselItem,
	InlineCitationCarouselNext,
	InlineCitationCarouselPrev,
	InlineCitationQuote,
	InlineCitationSource,
	InlineCitationText,
} from "@/components/ai-elements/inline-citation";

const SOURCES = [
	{
		description:
			"React Native lets you build mobile apps using only JavaScript and React, rendering with real native components.",
		quote:
			"Learn once, write anywhere: build mobile apps with React for iOS and Android.",
		title: "React Native · Learn once, write anywhere",
		url: "https://reactnative.dev/docs/getting-started",
	},
	{
		description:
			"Expo is an open-source platform for making universal native apps that run on Android, iOS, and the web.",
		quote:
			"Create universal native apps with React that run on Android and iOS.",
		title: "Expo Documentation",
		url: "https://docs.expo.dev/",
	},
	{
		description:
			"FlatList renders items lazily and supports horizontal paging via the pagingEnabled prop.",
		quote: "When true, the scroll view stops on multiples of its own size.",
		title: "ScrollView · React Native",
		url: "https://reactnative.dev/docs/scrollview",
	},
];

const meta = {
	title: "ai-elements/InlineCitation",
	component: InlineCitation,
} satisfies Meta<typeof InlineCitation>;

export default meta;

type Story = StoryObj<typeof meta>;

export const SingleSource: Story = {
	render: () => (
		<View className="w-full p-4">
			<InlineCitation>
				<InlineCitationText>
					Paging is handled natively by the scroll view
				</InlineCitationText>
				<InlineCitationCard>
					<InlineCitationCardTrigger sources={[SOURCES[2].url]} />
					<InlineCitationCardBody>
						<InlineCitationCarousel>
							<InlineCitationCarouselContent>
								<InlineCitationCarouselItem>
									<InlineCitationSource
										description={SOURCES[2].description}
										title={SOURCES[2].title}
										url={SOURCES[2].url}
									/>
									<InlineCitationQuote>{SOURCES[2].quote}</InlineCitationQuote>
								</InlineCitationCarouselItem>
							</InlineCitationCarouselContent>
						</InlineCitationCarousel>
					</InlineCitationCardBody>
				</InlineCitationCard>
			</InlineCitation>
		</View>
	),
};

export const MultipleSources: Story = {
	render: () => (
		<View className="w-full p-4">
			<InlineCitation>
				<InlineCitationText>
					React Native renders with real native components
				</InlineCitationText>
				<InlineCitationCard>
					<InlineCitationCardTrigger
						sources={SOURCES.map((source) => source.url)}
					/>
					<InlineCitationCardBody>
						<InlineCitationCarousel>
							<InlineCitationCarouselHeader>
								<InlineCitationCarouselPrev />
								<InlineCitationCarouselNext />
								<InlineCitationCarouselIndex />
							</InlineCitationCarouselHeader>
							<InlineCitationCarouselContent>
								{SOURCES.map((source) => (
									<InlineCitationCarouselItem key={source.url}>
										<InlineCitationSource
											description={source.description}
											title={source.title}
											url={source.url}
										/>
										<InlineCitationQuote>{source.quote}</InlineCitationQuote>
									</InlineCitationCarouselItem>
								))}
							</InlineCitationCarouselContent>
						</InlineCitationCarousel>
					</InlineCitationCardBody>
				</InlineCitationCard>
			</InlineCitation>
		</View>
	),
};

export const UnknownSource: Story = {
	render: () => (
		<View className="w-full p-4">
			<InlineCitation>
				<InlineCitationText>
					This claim has no attributable source
				</InlineCitationText>
				<InlineCitationCard>
					<InlineCitationCardTrigger sources={[]} />
					<InlineCitationCardBody>
						<InlineCitationCarousel>
							<InlineCitationCarouselContent>
								<InlineCitationCarouselItem>
									<InlineCitationSource title="Unknown source" />
								</InlineCitationCarouselItem>
							</InlineCitationCarouselContent>
						</InlineCitationCarousel>
					</InlineCitationCardBody>
				</InlineCitationCard>
			</InlineCitation>
		</View>
	),
};
