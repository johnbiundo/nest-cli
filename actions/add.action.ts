import chalk from 'chalk';

import { MESSAGES } from '../lib/ui';

import { Answers } from 'inquirer';
import { Input } from '../commands';
import {
  AbstractPackageManager,
  PackageManagerFactory,
} from '../lib/package-managers';
import {
  AbstractCollection,
  CollectionFactory,
  SchematicOption,
} from '../lib/schematics';
import { AbstractAction } from './abstract.action';

import { getValueOrDefault } from '../lib/compiler/helpers/get-value-or-default';

import {
  askForProjectName,
  moveDefaultProjectToStart,
  shouldAskForProject,
} from '../lib/utils/project-utils';

import { loadConfiguration } from '../lib/utils/load-configuration';

const schematicName = 'nest-add';

export class AddAction extends AbstractAction {
  public async handle(inputs: Input[], options: Input[], extraFlags: string[]) {
    const packageInstallResult = await this.installPackage(
      inputs,
      options,
      extraFlags,
    );
    console.log('pacakge install results:', packageInstallResult);
    const sourceRootOption = await this.getSourceRoot(inputs.concat(options));
    options.push(sourceRootOption);
    await this.addLibrary(inputs, options, extraFlags);
    process.exit(0);
  }

  private async getSourceRoot(inputs: Input[]) {
    const configuration = await loadConfiguration();
    const configurationProjects = configuration.projects;

    const appName = inputs.find(option => option.name === 'project')!
      .value as string;

    let sourceRoot = appName
      ? getValueOrDefault(configuration, 'sourceRoot', appName)
      : configuration.sourceRoot;

    const shouldAsk = await shouldAskForProject(
      schematicName,
      configurationProjects,
      appName,
    );
    if (shouldAsk) {
      const defaultLabel: string = ' [ Default ]';
      let defaultProjectName: string = configuration.sourceRoot + defaultLabel;

      for (const property in configurationProjects) {
        if (
          configurationProjects[property].sourceRoot ===
          configuration.sourceRoot
        ) {
          defaultProjectName = property + defaultLabel;
          break;
        }
      }

      const projects = moveDefaultProjectToStart(
        configuration,
        defaultProjectName,
        defaultLabel,
      );

      const answers: Answers = await askForProjectName(
        MESSAGES.LIBRARY_PROJECT_SELECTION_QUESTION,
        projects,
      );
      const project: string = answers.appName.replace(defaultLabel, '');
      if (project !== configuration.sourceRoot) {
        sourceRoot = configurationProjects[project].sourceRoot;
      }
    }

    return { name: 'sourceRoot', value: sourceRoot };
  }

  private async installPackage(
    inputs: Input[],
    options: Input[],
    extraFlags: string[],
  ) {
    const manager: AbstractPackageManager = await PackageManagerFactory.find();
    const libraryInput: Input = inputs.find(
      input => input.name === 'library',
    ) as Input;

    if (!libraryInput) {
      Promise.reject('No library');
    }

    const library: string = libraryInput.value as string;
    const packageName = library.startsWith('@')
      ? library.split('/', 2).join('/')
      : library.split('/', 1)[0];

    // Remove the tag/version from the package name.
    const collectionName =
      (packageName.startsWith('@')
        ? packageName.split('@', 2).join('@')
        : packageName.split('@', 1).join('@')) +
      library.slice(packageName.length);

    let tagName = packageName.startsWith('@')
      ? packageName.split('@', 3)[2]
      : packageName.split('@', 2)[1];

    tagName = tagName || 'latest';

    return await manager.addProduction([collectionName], tagName);
  }

  private async addLibrary(
    inputs: Input[],
    options: Input[],
    extraFlags: string[],
  ) {
    console.info(MESSAGES.LIBRARY_INSTALLATION_STARTS);
    const libraryInput: Input = inputs.find(
      input => input.name === 'library',
    ) as Input;

    if (!libraryInput) {
      Promise.reject('No library');
    }

    const library: string = libraryInput.value as string;
    const packageName = library.startsWith('@')
      ? library.split('/', 2).join('/')
      : library.split('/', 1)[0];

    // Remove the tag/version from the package name.
    const collectionName =
      (packageName.startsWith('@')
        ? packageName.split('@', 2).join('@')
        : packageName.split('@', 1).join('@')) +
      library.slice(packageName.length);

    try {
      const collection: AbstractCollection = CollectionFactory.create(
        collectionName,
      );
      const schematicOptions: SchematicOption[] = [];

      schematicOptions.push(
        new SchematicOption('sourceRoot', options.find(
          option => option.name === 'sourceRoot',
        )!.value as string),
      );

      const extraFlagsString = extraFlags ? extraFlags.join(' ') : undefined;

      await collection.execute(
        schematicName,
        schematicOptions,
        extraFlagsString,
      );
    } catch (error) {
      if (error && error.message) {
        console.error(chalk.red(error.message));
        return Promise.reject();
      }
    }
  }
}
