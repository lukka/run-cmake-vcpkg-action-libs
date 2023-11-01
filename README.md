[![build/test and publish](https://github.com/lukka/run-cmake-vcpkg-action-libs/actions/workflows/build-publish.yml/badge.svg)](https://github.com/lukka/run-cmake-vcpkg-action-libs/actions/workflows/build-publish.yml)


[![Coverage Status](https://coveralls.io/repos/github/lukka/run-cmake-vcpkg-action-libs/badge.svg?branch=main)](https://coveralls.io/github/lukka/run-cmake-vcpkg-action-libs?branch=main)
# Core NPM packages for run-vcpkg and run-cmake 

This repository contains the npm packages for:
  - [**run-cmake** GitHub action](https://github.com/marketplace/actions/run-cmake);
  - [**run-vcpkg** GitHub action](https://github.com/marketplace/actions/run-vcpkg);
  - [CppBuildTasks AzureDevops extension](https://marketplace.visualstudio.com/items?itemName=lucappa.cmake-ninja-vcpkg-tasks)

# Developers information

## Prerequisites

Install npm, and install all dependencies:
 
 > npm install
 > npm run bootstrap

## Build and lint
Build with `tsc` running:

 > npm run build

Launch `lint` by:

 > npm run lint

## Test

Launch tests with:

 > npm run test

## <a id='contributing'>Contributing</a>

The software is provided as is, there is no warranty of any kind. All users are encouraged to improve the [source code](https://github.com/lukka/run-cmake-vcpkg-action-libs) with fixes and new features.

# License
All the content in this repository is licensed under the [MIT License](LICENSE.txt).

Copyright (c) 2019-2020-2021-2022-2023 Luca Cappa



        "adm-zip": "^0.4.13",
        "follow-redirects": "^1.15.1",
        "ini": ">=1.3.6",
        "lodash": ">=4.17.19",
        "minimist": ">=1.2.2",
        "node-notifier": ">=8.0.1",
        "ssri": ">=6.0.2",
        "uuid": "^8.3.2"
