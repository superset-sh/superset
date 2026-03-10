import chalk from "chalk";

export const logger = {
  info: (message: string) => console.log(chalk.blue("ℹ"), message),
  success: (message: string) => console.log(chalk.green("✓"), message),
  warning: (message: string) => console.log(chalk.yellow("⚠"), message),
  error: (message: string) => console.log(chalk.red("✗"), message),
  step: (message: string) => console.log(chalk.cyan("→"), message),

  title: (message: string) => {
    console.log();
    console.log(chalk.bold.white(message));
    console.log();
  },

  table: (data: Record<string, string>[]) => {
    console.table(data);
  },

  blank: () => console.log(),
};
