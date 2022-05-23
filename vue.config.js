const { defineConfig } = require("@vue/cli-service");
module.exports = defineConfig({
  // pages: {
  //   mainwindow: {
  //     entry: 'src/windows/MainWindow/main.ts',
  //     template: 'public/main-window.html',
  //     filename: 'main-window.html',
  //   },
  //   subwindow: {
  //     entry: 'src/windows/Subwindow/main.ts',
  //     template: "template"
  //   }
  // }
  transpileDependencies: true,
});
