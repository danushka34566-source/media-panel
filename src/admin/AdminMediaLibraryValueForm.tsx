'use client';

import SubmitButtonWithStatus from '@/components/SubmitButtonWithStatus';
import Link from 'next/link';
import FieldsetWithStatus from '@/components/FieldsetWithStatus';
import { ReactNode, useMemo, useState } from 'react';
import { useAppState } from '@/app/AppState';
import {
  updateMediaLibraryValueAction,
} from '@/media/actions';
import type { MediaLibraryValueType } from '@/media/query';

const TYPE_OPTIONS: { value: MediaLibraryValueType, label: string }[] = [
  { value: 'tag', label: 'Tag' },
  { value: 'category', label: 'Category' },
  { value: 'studio', label: 'Studio' },
  { value: 'performer', label: 'Performer' },
  { value: 'contentType', label: 'Content Type' },
];

export default function AdminMediaLibraryValueForm({
  value,
  sourceType,
  label,
  backPath,
  children,
}: {
  value: string
  sourceType: MediaLibraryValueType
  label: string
  backPath: string
  children?: ReactNode
}) {
  const { invalidateSwr } = useAppState();
  const [updatedValue, setUpdatedValue] = useState(value);
  const [targetType, setTargetType] = useState<MediaLibraryValueType>(sourceType);
  // Tags previously went through parameterize(), which lowercased them and
  // made the tag editor behave differently from categories, studios,
  // performers, and content types. Preserve the entered casing for every
  // library value; URL/path formatting remains a separate concern.
  const normalizedValue = useMemo(() => updatedValue.trim(), [updatedValue]);
  const targetLabel = TYPE_OPTIONS.find(item => item.value === targetType)?.label;

  return (
    <form action={updateMediaLibraryValueAction} className="space-y-8">
      <input name="sourceType" value={sourceType} hidden readOnly />
      <input name="targetType" value={targetType} hidden readOnly />
      <FieldsetWithStatus
        label={`New ${targetLabel ?? label} Name`}
        value={updatedValue}
        onChange={setUpdatedValue}
      />
      <FieldsetWithStatus
        label="Store This Value As"
        value={targetType}
        onChange={next => setTargetType(next as MediaLibraryValueType)}
        selectOptions={TYPE_OPTIONS.map(option => ({
          value: option.value,
          label: option.label,
        }))}
      />
      <input name="value" value={value} hidden readOnly />
      <input
        name="updatedValue"
        value={normalizedValue}
        hidden
        readOnly
      />
      {children}
      <div className="flex gap-3">
        <Link className="button" href={backPath}>Cancel</Link>
        <SubmitButtonWithStatus
          disabled={!normalizedValue || (
            normalizedValue === value && targetType === sourceType
          )}
          onFormSubmit={invalidateSwr}
        >
          Update
        </SubmitButtonWithStatus>
      </div>
    </form>
  );
}
