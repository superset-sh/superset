import React from 'react';
import {Text} from 'ink';

export default function App({name = 'Stranger'}) {
	return (
		<Text>
			Hello, <Text color="green">{name}</Text>
		</Text>
	);
}
