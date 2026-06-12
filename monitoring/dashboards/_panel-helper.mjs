/** Shared OpenObserve v8 panel builder for KPI dashboard JSON exports. */

export function sqlPanel({ id, title, type, stream, sql, layout }) {
  return {
    id,
    type,
    title,
    description: '',
    config: {
      show_legends: true,
      legends_position: null,
      show_symbol: type === 'line',
      show_gridlines: true,
    },
    queryType: 'sql',
    queries: [
      {
        query: sql,
        vrlFunctionQuery: '',
        customQuery: true,
        fields: {
          stream,
          stream_type: 'logs',
          x: [],
          y: [],
          z: [],
          breakdown: [],
          filter: {
            filterType: 'group',
            logicalOperator: 'AND',
            conditions: [],
          },
        },
        config: {
          promql_legend: '',
        },
      },
    ],
    layout,
  };
}

export function dashboardV8({ title, description, panels }) {
  return {
    version: 8,
    title,
    description,
    role: '',
    owner: '',
    created: 0,
    tabs: [
      {
        tabId: 'tab-kpis',
        name: 'KPIs',
        panels,
      },
    ],
    variables: {
      list: [],
      showDynamicFilters: false,
    },
  };
}
