# demo — registry: foundation · panel: P5 · entry/role picker: P2

`demoActions.ts` is the only registry. P3/P4 register actions using `DEMO_ACTION_IDS`; P5 builds the one Demo Control panel.
`demoContext.ts` says which Jam and which member the actions target (`getDemoContext()`); never hardcode seeded ids.
