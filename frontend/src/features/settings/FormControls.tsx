import { Loader2, Plus, TriangleAlert } from 'lucide-react';
import type { ResourceOption } from './types';
import { readErrorMessage } from './utils';

type TextFieldProps = {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
};

type SelectFieldProps = {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  options: ResourceOption[];
  placeholder: string;
  required?: boolean;
};

type TextareaFieldProps = {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

export function FormError({ error }: { error: unknown }) {
  if (!error) {
    return null;
  }

  return (
    <div className="form-error" role="status">
      <TriangleAlert size={16} aria-hidden="true" />
      <span>{readErrorMessage(error, 'form')}</span>
    </div>
  );
}

export function SubmitButton({
  isPending,
  disabled,
  children
}: {
  isPending: boolean;
  disabled?: boolean;
  children: string;
}) {
  return (
    <button className="primary-button" type="submit" disabled={disabled || isPending}>
      {isPending ? <Loader2 size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
      <span>{isPending ? '提交中' : children}</span>
    </button>
  );
}

export function TextField({ label, name, value, onChange, placeholder, required }: TextFieldProps) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        name={name}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
      />
    </label>
  );
}

export function SelectField({ label, name, value, onChange, options, placeholder, required }: SelectFieldProps) {
  return (
    <label className="field">
      <span>{label}</span>
      <select
        name={name}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        disabled={options.length === 0 && required}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function TextareaField({ label, name, value, onChange, placeholder }: TextareaFieldProps) {
  return (
    <label className="field">
      <span>{label}</span>
      <textarea
        name={name}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={3}
      />
    </label>
  );
}
