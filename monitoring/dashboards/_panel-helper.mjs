/** Shared OpenObserve v8 panel builder for KPI dashboard JSON exports. */

export function sqlPanel({ id, title, type, stream, sql, layout }) {
  if (!layout?.i || layout.i < 1) {
    throw new Error(`Panel ${id}: layout.i must be a positive integer (OpenObserve v8 i64)`);
  }

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
    layout: {
      x: layout.x,
      y: layout.y,
      w: layout.w,
      h: layout.h,
      i: layout.i,
    },
    htmlContent: '',
    markdownContent: '',
  };
}

export function dashboardV8({ dashboardId, title, description, panels }) {
  return {
    version: 8,
    dashboardId,
    title,
    description,
    role: '',
    owner: '',
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
    defaultDatetimeDuration: {
      type: 'relative',
      relativeTimePeriod: '15m',
    },
  };
}
