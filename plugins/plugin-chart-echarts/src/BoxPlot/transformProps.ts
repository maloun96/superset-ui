/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import {
  CategoricalColorNamespace,
  DataRecordValue,
  getMetricLabel,
  getNumberFormatter,
  getTimeFormatter,
} from '@superset-ui/core';
import { EChartsOption, BoxplotSeriesOption } from 'echarts';
import { CallbackDataParams } from 'echarts/types/src/util/types';
import {
  BoxPlotChartTransformedProps,
  BoxPlotQueryFormData,
  EchartsBoxPlotChartProps,
} from './types';
import { extractGroupbyLabel, getColtypesMapping } from '../utils/series';
import { defaultGrid, defaultTooltip, defaultYAxis } from '../defaults';

export default function transformProps(
  chartProps: EchartsBoxPlotChartProps,
): BoxPlotChartTransformedProps {
  const { width, height, formData, hooks, ownCurrentState, queriesData } = chartProps;
  const { selectedValues = [] } = ownCurrentState;
  console.log('selectedValues', selectedValues);
  const { data = [] } = queriesData[0];
  const { setDataMask = () => {} } = hooks;
  const coltypeMapping = getColtypesMapping(queriesData[0]);
  const {
    colorScheme,
    groupby = [],
    metrics: formdataMetrics = [],
    numberFormat,
    dateFormat,
    xTicksLayout,
    emitFilter,
  } = formData as BoxPlotQueryFormData;
  const colorFn = CategoricalColorNamespace.getScale(colorScheme as string);
  const numberFormatter = getNumberFormatter(numberFormat);
  const metricLabels = formdataMetrics.map(getMetricLabel);

  const transformedData = data
    .map((datum: any) => {
      const groupbyLabel = extractGroupbyLabel({
        datum,
        groupby,
        coltypeMapping,
        timeFormatter: getTimeFormatter(dateFormat),
      });
      return metricLabels.map(metric => {
        const name = metricLabels.length === 1 ? groupbyLabel : `${groupbyLabel}, ${metric}`;
        return {
          name,
          value: [
            datum[`${metric}__min`],
            datum[`${metric}__q1`],
            datum[`${metric}__median`],
            datum[`${metric}__q3`],
            datum[`${metric}__max`],
            datum[`${metric}__mean`],
            datum[`${metric}__count`],
            datum[`${metric}__outliers`],
          ],
          itemStyle: {
            color: colorFn(groupbyLabel),
            opacity: 0.6,
            borderColor: colorFn(groupbyLabel),
          },
        };
      });
    })
    .flatMap(row => row);
  const outlierData = data
    .map(datum =>
      metricLabels.map(metric => {
        const groupbyLabel = extractGroupbyLabel({
          datum,
          groupby,
          coltypeMapping,
          timeFormatter: getTimeFormatter(dateFormat),
        });
        const name = metricLabels.length === 1 ? groupbyLabel : `${groupbyLabel}, ${metric}`;
        // Outlier data is a nested array of numbers (uncommon, therefore no need to add to DataRecordValue)
        const outlierDatum = (datum[`${metric}__outliers`] || []) as number[];
        return {
          name: 'outlier',
          type: 'scatter',
          data: outlierDatum.map(val => [name, val]),
          tooltip: {
            formatter: (param: { data: [string, number] }) => {
              const [outlierName, stats] = param.data;
              const headline = groupby ? `<p><strong>${outlierName}</strong></p>` : '';
              return `${headline}${numberFormatter(stats)}`;
            },
          },
          itemStyle: {
            color: colorFn(groupbyLabel),
          },
        };
      }),
    )
    .flat(2);

  const labelMap = data.reduce((acc: Record<string, DataRecordValue[]>, datum) => {
    const label = extractGroupbyLabel({
      datum,
      groupby,
      coltypeMapping,
      timeFormatter: getTimeFormatter(dateFormat),
    });
    return {
      ...acc,
      [label]: groupby.map(col => datum[col]),
    };
  }, {});

  const selectedValuesIndexes = selectedValues.map((selectedValue: string) =>
    transformedData.findIndex(({ name }) => name === selectedValue),
  );

  let axisLabel;
  if (xTicksLayout === '45°') axisLabel = { rotate: -45 };
  else if (xTicksLayout === '90°') axisLabel = { rotate: -90 };
  else if (xTicksLayout === 'flat') axisLabel = { rotate: 0 };
  else if (xTicksLayout === 'staggered') axisLabel = { rotate: -45 };
  else axisLabel = { show: true };

  const series: BoxplotSeriesOption[] = [
    {
      name: 'boxplot',
      type: 'boxplot',
      data: transformedData,
      tooltip: {
        formatter: (param: CallbackDataParams) => {
          // @ts-ignore
          const {
            value,
            name,
          }: {
            value: [number, number, number, number, number, number, number, number, number[]];
            name: string;
          } = param;
          const headline = name ? `<p><strong>${name}</strong></p>` : '';
          const stats = [
            `Max: ${numberFormatter(value[5])}`,
            `3rd Quartile: ${numberFormatter(value[4])}`,
            `Mean: ${numberFormatter(value[6])}`,
            `Median: ${numberFormatter(value[3])}`,
            `1st Quartile: ${numberFormatter(value[2])}`,
            `Min: ${numberFormatter(value[1])}`,
            `# Observations: ${numberFormatter(value[7])}`,
          ];
          if (value[8].length > 0) {
            stats.push(`# Outliers: ${numberFormatter(value[8].length)}`);
          }
          return headline + stats.join('<br/>');
        },
      },
    },
    // @ts-ignore
    ...outlierData,
  ];

  const echartOptions: EChartsOption = {
    grid: {
      ...defaultGrid,
      top: 30,
      bottom: 30,
      left: 20,
      right: 20,
    },
    xAxis: {
      type: 'category',
      data: transformedData.map(row => row.name),
      axisLabel,
    },
    yAxis: {
      ...defaultYAxis,
      type: 'value',
      axisLabel: { formatter: numberFormatter },
    },
    tooltip: {
      ...defaultTooltip,
      trigger: 'item',
      axisPointer: {
        type: 'shadow',
      },
    },
    series,
  };

  return {
    formData,
    width,
    height,
    echartOptions,
    setDataMask,
    emitFilter,
    labelMap,
    groupby,
    selectedValues,
    selectedValuesIndexes,
  };
}
