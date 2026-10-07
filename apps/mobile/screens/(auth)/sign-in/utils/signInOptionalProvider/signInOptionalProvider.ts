type SignInResult = { error?: { message?: string } | null };
type SignInClient = {
	social: (input: {
		provider: "gitlab";
		callbackURL: string;
	}) => Promise<SignInResult>;
};
export async function signInOptionalProvider(
	provider: "gitlab",
	client: SignInClient,
): Promise<void> {
	const result = await client.social({ provider, callbackURL: "/" });
	if (result.error) {
		throw new Error(result.error.message);
	}
}
