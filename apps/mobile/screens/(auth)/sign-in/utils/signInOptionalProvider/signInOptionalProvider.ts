type SignInResult = { error?: { message?: string } | null };
type SignInClient = {
	oauth2: (input: {
		providerId: string;
		callbackURL: string;
	}) => Promise<SignInResult>;
};
export async function signInOptionalProvider(
	provider: "authentik",
	client: SignInClient,
): Promise<void> {
	const result = await client.oauth2({
		providerId: provider,
		callbackURL: "/",
	});
	if (result.error) throw new Error(result.error.message);
}
