import { mapSizes, type MapSizeId } from "../data/map-selection";

export function MapSizeSelector({
  value,
  onChange,
}: {
  value: MapSizeId;
  onChange: (size: MapSizeId) => void;
}) {
  return (
    <fieldset className="map-size-selector">
      <legend>マップサイズ</legend>
      <div>
        {mapSizes.map((size) => (
          <button
            key={size.id}
            type="button"
            aria-pressed={value === size.id}
            onClick={() => onChange(size.id)}
          >
            <strong>{size.label}</strong>
            <span>{size.hexCount}マス</span>
            <small>半径{size.radius}</small>
          </button>
        ))}
      </div>
    </fieldset>
  );
}
