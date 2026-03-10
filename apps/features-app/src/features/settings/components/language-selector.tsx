import { useTranslation } from "@superbuilder/features-client/core/i18n";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@superbuilder/feature-ui/shadcn/select";

interface Props {}

export function LanguageSelector({}: Props) {
  const { i18n } = useTranslation();

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium">언어</label>
      <Select
        value={i18n.language}
        onValueChange={(value) => {
          if (!value) return;
          i18n.changeLanguage(value);
          localStorage.setItem("atlas_language", value);
        }}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {LANGUAGE_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Constants
 * -----------------------------------------------------------------------------------------------*/

const LANGUAGE_OPTIONS = [
  { value: "ko", label: "한국어" },
  { value: "en", label: "English" },
];
