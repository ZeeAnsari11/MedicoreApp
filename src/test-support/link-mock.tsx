/** Test stand-in for expo-router's `Link` (never imported by app code). */
import { isValidElement, type ReactNode } from 'react';

/**
 * Renders the child like a pass-through, but keeps expo-router's dev check: with `asChild`, `<Slot>` throws when the
 * child's `style` is an array (it must be flattened with StyleSheet.flatten). Without this, tests miss that render error.
 */
export function MockLink({ asChild, children }: { asChild?: boolean; children?: ReactNode }) {
  if (asChild && isValidElement<{ style?: unknown }>(children) && Array.isArray(children.props.style)) {
    throw new Error('[expo-router]: You are passing an array of styles to a child of <Slot>. Consider flattening the styles with StyleSheet.flatten before passing them to the child component.');
  }
  return children;
}
