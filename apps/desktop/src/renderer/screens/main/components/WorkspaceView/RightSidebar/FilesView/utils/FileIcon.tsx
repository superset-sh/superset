import { getFileIcon } from "./file-icons";

interface FileIconProps {
	fileName: string;
	isDirectory?: boolean;
	isOpen?: boolean;
	className?: string;
}

export function FileIcon({
	fileName,
	isDirectory = false,
	isOpen = false,
	className,
}: FileIconProps) {
	const { src } = getFileIcon(fileName, isDirectory, isOpen);
	return <img src={src} alt="" draggable={false} className={className} />;
}
