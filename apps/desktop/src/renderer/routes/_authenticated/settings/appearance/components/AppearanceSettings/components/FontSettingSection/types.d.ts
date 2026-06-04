interface Window {
	queryLocalFonts?: () => Promise<
		{
			family: string;
			fullName: string;
			postscriptName: string;
			style: string;
		}[]
	>;
}
