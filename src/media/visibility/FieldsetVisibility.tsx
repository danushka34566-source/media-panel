import FieldsetWithStatus from '@/components/FieldsetWithStatus';
import { ComponentProps, Dispatch, SetStateAction } from 'react';
import {
  getVisibilityValue,
  updateFormDataWithVisibility,
  VISIBILITY_OPTIONS,
  VisibilityValue,
} from '.';
import { MediaFormData } from '../form';

export default function FieldsetVisibility({
  formData,
  setFormData,
  ...props
}: {
  label?: string
  formData: Partial<MediaFormData>
  setFormData: Dispatch<SetStateAction<Partial<MediaFormData>>>
} & Omit<ComponentProps<typeof FieldsetWithStatus>, 'label' | 'value'>) {
  return (
    <FieldsetWithStatus
      label="Visibility"
      {...props}
      className={`relative z-50 ${props.className ?? ''}`.trim()}
      selectOptions={VISIBILITY_OPTIONS}
      value={getVisibilityValue(formData)}
      onChange={value => setFormData(data =>
        updateFormDataWithVisibility(
          data,
          value as VisibilityValue,
        ))}
    />
  );
}
