import React from "react";

export default function Link(props: { href: string; children?: React.ReactNode; [key: string]: unknown }) {
  const { href, children, ...rest } = props;
  return React.createElement("a", { href, ...rest }, children);
}
