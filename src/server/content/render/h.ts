/** בונה עץ אלמנטים בפורמט שסאטורי (satori) מצפה לו, בלי תלות ב-JSX. */
export type SatoriNode = {
  type: string;
  props: Record<string, unknown>;
};

export function h(
  type: string,
  props: Record<string, unknown> = {},
  ...children: (SatoriNode | string | null | false | undefined)[]
): SatoriNode {
  const flatChildren = children.filter(
    (c): c is SatoriNode | string => c !== null && c !== false && c !== undefined
  );
  return {
    type,
    props: {
      ...props,
      children: flatChildren.length === 1 ? flatChildren[0] : flatChildren,
    },
  };
}
