type FixBlueprintLockedPreviewProps = {
  onUpgrade: () => void;
};

export default function FixBlueprintLockedPreview({ onUpgrade }: FixBlueprintLockedPreviewProps) {
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={onUpgrade}
        className="text-[10px] font-medium text-[var(--accent)] hover:underline"
      >
        Unlock to see Fix Blueprint
      </button>
    </div>
  );
}