import {
  InlineStack,
  Tag,
  Listbox,
  EmptySearchResult,
  Combobox,
  Text,
  AutoSelection,
} from '@shopify/polaris';
import type { DiscountItem } from 'app/types';
import { useState, useCallback, useMemo } from 'react';

type Props = {
  items: DiscountItem[];
  value?: string[];
  onChange?: (next: string[]) => void;
  defaultSelectedIds?: string[];
};

export function DiscountSelector({
  items,
  value,
  onChange,
  defaultSelectedIds = [],
}: Props) {
  const [internalSelected, setInternalSelected] = useState<string[]>(defaultSelectedIds);
  const selectedIds = value ?? internalSelected;

  const applySelection = useCallback(
    (next: string[]) => {
      onChange?.(next);
      if (value === undefined) setInternalSelected(next); // uncontrolled case
    },
    [onChange, value],
  );

  const [query, setQuery] = useState('');
  const [suggestion, setSuggestion] = useState('');

  const onActiveOptionChange = useCallback(
    (activeValue: string) => {
      if (!selectedIds.includes(activeValue)) setSuggestion('');
    },
    [selectedIds],
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(
      d =>
        d.title.toLowerCase().includes(q) ||
        (d.subtitle?.toLowerCase().includes(q) ?? false),
    );
  }, [items, query]);

  const onSelect = useCallback(
    (id: string) => {
      const next = selectedIds.includes(id)
        ? selectedIds.filter(v => v !== id)
        : [...selectedIds, id];
      applySelection(next);
    },
    [selectedIds, applySelection],
  );

  const removeTag = useCallback(
    (id: string) => () => applySelection(selectedIds.filter(v => v !== id)),
    [selectedIds, applySelection],
  );

  const selectedItems = useMemo(
    () =>
      selectedIds
        .map(id => items.find(i => i.id === id))
        .filter(Boolean) as DiscountItem[],
    [selectedIds, items],
  );

  const highlight = useCallback(
    (text: string) => {
      if (!query) return text;
      const i = text.toLowerCase().indexOf(query.toLowerCase());
      if (i === -1) return text;
      const start = text.slice(0, i);
      const mid = text.slice(i, i + query.length);
      const end = text.slice(i + query.length);
      return (
        <span>
          {start}
          <Text as="span" fontWeight="bold">
            {mid}
          </Text>
          {end}
        </span>
      );
    },
    [query],
  );

  const verticalContent =
    selectedItems.length > 0 ? (
      <InlineStack gap="300" align="start">
        {selectedItems.map(d => (
          <Tag key={d.id} onRemove={removeTag(d.id)}>
            {d.subtitle ? `${d.subtitle} • ${d.title}` : d.title}
          </Tag>
        ))}
      </InlineStack>
    ) : null;

  const optionMarkup =
    filtered.length > 0
      ? filtered.map(d => {
        const selected = selectedIds.includes(d.id);
        return (
          <Listbox.Option
            key={d.id}
            value={d.id}
            selected={selected}
            accessibilityLabel={d.title}
          >
            <Listbox.TextOption selected={selected}>
              <InlineStack gap="200" align="space-between" blockAlign="center">
                <span>
                  {highlight(d.title)}
                  {d.subtitle ? (
                    <>
                      {' '}• <Text tone="subdued" as="span">
                        {highlight(d.subtitle)}
                      </Text>
                    </>
                  ) : null}
                </span>
              </InlineStack>
            </Listbox.TextOption>
          </Listbox.Option>
        );
      })
      : null;

  const emptyState =
    !optionMarkup ? (
      <EmptySearchResult title="" description={`No discounts match "${query}"`} />
    ) : null;

  return (
    <Combobox
      allowMultiple
      activator={
        <Combobox.TextField
          autoComplete="off"
          label="Search discounts"
          labelHidden
          value={query}
          onChange={setQuery}
          suggestion={suggestion}
          placeholder="Search discounts by title or code"
          verticalContent={verticalContent}
        />
      }
    >
      <Listbox
        autoSelection={AutoSelection.None}
        onSelect={onSelect}
        onActiveOptionChange={onActiveOptionChange}
      >
        {optionMarkup}
        {emptyState}
      </Listbox>
    </Combobox>
  );
}
