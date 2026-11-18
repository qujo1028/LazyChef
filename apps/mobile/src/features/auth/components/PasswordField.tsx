import { TextField } from '@/components/TextField';
import type { ComponentProps } from 'react';

type Props = Omit<ComponentProps<typeof TextField>, 'secureTextEntry' | 'autoCapitalize' | 'autoCorrect'> & {
  /** "new" for sign up and reset (offers a strong password), "current" for sign in. */
  kind: 'new' | 'current';
};

/** A password input with the right autofill hints for password managers. */
export function PasswordField({ kind, ...props }: Props) {
  return (
    <TextField
      secureTextEntry
      autoCapitalize="none"
      autoCorrect={false}
      textContentType={kind === 'new' ? 'newPassword' : 'password'}
      autoComplete={kind === 'new' ? 'new-password' : 'current-password'}
      {...props}
    />
  );
}
