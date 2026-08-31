// Barrel dos componentes Tremor vendorizados (data-viz), re-tematizados aos
// tokens do QuéOta Skin. As superfícies (Card, Badge, etc.) continuam vindo do
// shadcn; daqui saem só os gráficos e listas.
//
// A cor sai dos nossos CSS vars via `utils/chartColors.ts`: use as chaves
// `chart1..chart5` e `primary` na prop `colors={[...]}`.

export { AreaChart, type AreaChartEventProps } from "./components/AreaChart/AreaChart";
export { ComboChart, type ComboChartEventProps } from "./components/ComboChart/ComboChart";
export { BarList, type BarListProps } from "./components/BarList/BarList";
export { DonutChart, type DonutChartEventProps } from "./components/DonutChart/DonutChart";
export { CategoryBar, type CategoryBarProps } from "./components/CategoryBar/CategoryBar";
export { ProgressBar, type ProgressBarProps } from "./components/ProgressBar/ProgressBar";
export {
  SparkAreaChart,
  SparkLineChart,
  SparkBarChart,
} from "./components/SparkChart/SparkChart";
export { Tooltip } from "./components/Tooltip/Tooltip";
export {
  type AvailableChartColorsKeys,
  type ColorUtility,
  AvailableChartColors,
  chartColors,
  getColorClassName,
} from "./utils/chartColors";
