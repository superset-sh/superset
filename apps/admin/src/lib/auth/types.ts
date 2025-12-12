export interface User {
	id: string;
	email: string;
	name: string;
	imageUrl?: string;
}

export interface AuthState {
	user: User | null;
	isLoaded: boolean;
	isSignedIn: boolean;
}
