import { Configuration, TargetConfiguration } from 'electron-builder';

/**
 * @see https://www.electron.build/#documentation
 */
const config: Configuration = {
    appId: 'sh.superset.desktop',
    asar: true,
    directories: {
        output: 'release/${version}',
    },
    files: ['dist-electron', 'dist'],
    extraResources: [
		// TODO: This is where we can add the binary for the CLI agents, Example for bun:
        // {
        //     from: 'resources/bun',
        //     to: 'bun',
        //     filter: ['**/*'],
        // },
    ],
    mac: {
        artifactName: '${productName}-${arch}.${ext}',
        category: 'public.app-category.developer-tools',
        hardenedRuntime: true,
        gatekeeperAssess: false,
        target: [
            {
                target: 'dmg',
                arch: ['x64', 'arm64'],
            } as TargetConfiguration,
            {
                target: 'zip',
                arch: ['x64', 'arm64'],
            } as TargetConfiguration,
        ],
    },
    win: {
        target: [
            {
                target: 'nsis',
                arch: ['x64'],
            } as TargetConfiguration,
        ],
        artifactName: '${productName}-setup.${ext}',
        azureSignOptions: {
            publisherName: 'On Off, Inc',
            certificateProfileName: 'public-trust-onlook',
            codeSigningAccountName: 'trusted-onlook',
            endpoint: 'https://eus.codesigning.azure.net',
            timestampDigest: 'SHA256',
            timestampRfc3161: 'http://timestamp.acs.microsoft.com',
        },
    },
    linux: {
        target: [
            {
                target: 'AppImage',
                arch: ['x64', 'arm64'],
            } as TargetConfiguration,
            {
                target: 'deb',
                arch: ['x64', 'arm64'],
            } as TargetConfiguration,
        ],
        artifactName: '${productName}-${arch}.${ext}',
        category: 'Utility',
        executableName: 'Superset',
        icon: 'build/icon.icns',
        protocols: [
            {
                name: 'superset',
                schemes: ['superset'],
            },
        ],
    },
    nsis: {},
    publish: {
        provider: 'github',
        owner: 'superset-sh',
        repo: 'superset',
    },
};

export default config;