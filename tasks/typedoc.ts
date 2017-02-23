import ITask = grunt.task.ITask;
import { config, cp, rm } from 'shelljs';
import { execSync } from 'child_process';
import { join } from 'path';

export = function (grunt: IGrunt) {
	grunt.registerTask('typedoc', function (this: ITask) {
		// Throw when any shelljs command fails
		config.fatal = true;

		function exec(command: string, options: any = {}) {
			// Use execSync from child_process instead of shelljs.exec for better
			// handling of pass-through stdio
			options.encoding = options.encoding || 'utf8';
			options.stdio = options.stdio || (options.silent ? 'pipe' : 'inherit');
			return execSync(command, options);
		}

		function publish() {
			const docDir = options.out;
			const cloneDir = grunt.config.get<string>('apiPubDirectory');
			const publishBranch = publishOptions.branch || 'gh-pages';
			const publishDir = publishOptions.subdir || 'api';

			exec(`git clone . ${cloneDir}`, { silent: true });

			// Queue a task to remove the temporary clone when this task is done
			grunt.config.set(`clean.apipub`, { src: cloneDir });
			grunt.task.run('clean:apipub');

			try {
				exec(`git checkout ${publishBranch}`, { silent: true, cwd: cloneDir });
			}
			catch (error) {
				// publish branch didn't exist, so create it
				exec(`git checkout --orphan ${publishBranch}`, { silent: true, cwd: cloneDir });
				exec('git rm -rf .', { silent: true, cwd: cloneDir });
				grunt.log.writeln(`Created ${publishBranch} branch`);
			}

			rm('-rf', join(cloneDir, publishDir));
			cp('-r', docDir, join(cloneDir, publishDir));

			if (exec('git status --porcelain', { silent: true, cwd: cloneDir }) === '') {
				grunt.log.writeln('Nothing changed');
				return;
			}

			exec(`git add ${publishDir}`, { silent: true, cwd: cloneDir });
			exec('git commit -m "Update API docs"', { silent: true, cwd: cloneDir });

			// push changes from the temporary clone to the local repo
			exec('git push', { silent: true, cwd: cloneDir });
			grunt.log.writeln(`Updated ${publishBranch} in local repo`);

			// push changes from the local repo to the origin repo
			exec(`git push origin ${publishBranch}`, { silent: true });
			grunt.log.writeln(`Pushed ${publishBranch} to origin`);
		}

		const options: any = this.options({});
		const outOption = grunt.option<string>('doc-dir');
		options.out = outOption || options.out || grunt.config.get<string>('apiDocDirectory');

		const args: string[] = [];
		Object.keys(options).filter(key => {
			return key !== 'publishOptions';
		}).forEach(key => {
			if (typeof options[key] === 'boolean') {
				if (options[key]) {
					args.push('--' + key);
				}
			}
			else if (options[key]) {
				args.push('--' + key);
				args.push(`"${options[key]}"`);
			}
		});

		// Use project-local typedoc
		const typedoc = require.resolve('typedoc/bin/typedoc');
		exec(`node "${typedoc}" ${args.join(' ')}`);

		const publishOptions = options.publishOptions || {};

		if (grunt.option('publish-api')) {
			const shouldPush = publishOptions.shouldPush || (() => false);
			if (!shouldPush()) {
				grunt.log.writeln('Push check failed -- not publishing API docs');
			}
			else {
				grunt.log.writeln('Publishing API docs');
				publish();
			}
		}
	});
};