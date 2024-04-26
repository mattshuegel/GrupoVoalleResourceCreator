// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import fs from 'fs';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "Grupo Voalle Resource Creator" is now active!');

	let disposable = vscode.commands.registerCommand('extension.generateResourceForText', async () => {
		// Obter o texto selecionado
		const editor = vscode.window.activeTextEditor;
		if (editor) {
				let selection = editor.selection;
				const selectedText = editor.document.getText(selection);

				const config = vscode.workspace.getConfiguration('v-intl');
        const projectBasePath = config.get<string>('projectBasePath');
        const resourcesBaseRelativePath = config.get<string>('resourcesBaseRelativePath');
        const fieldClassRelativePath = config.get<string>('fieldClassRelativePath');
        const globalClassRelativePath = config.get<string>('globalClassRelativePath');
        const resourceLocalizationBaseName = config.get<string>('resourceLocalizationBaseName');

				// Solicitar ao usuário que digite um texto
				const resourceKey = await vscode.window.showInputBox({
						prompt: 'Chave para o recurso:',
						placeHolder: 'ex: str_s_foo, str_f_foo',
				});

				if (!resourceKey?.startsWith('str_f') && !resourceKey?.startsWith('str_s')) {
					vscode.window.showErrorMessage('A chave deve iniciar com "str_s" para frases ou "str_f" para palavras.');
					return;
				}
				
				const treatSpearator = (source?: string): string => {
					return source?.endsWith('/') ? source : source + '/';
				};

				const resourcesBasePath = `${ treatSpearator(projectBasePath) }${ treatSpearator(resourcesBaseRelativePath) }`;
								
				const resourceFiles = fs.readdirSync(resourcesBasePath);

				if (!resourceFiles) {
					vscode.window.showErrorMessage(`Não há arquivos no diretório: ${resourceFiles}`);
					return;
				}

				resourceFiles.forEach(filePath => {
					if (filePath.startsWith(resourceLocalizationBaseName ?? '')) {
						const fullFilePath = `${resourcesBasePath}${filePath}`;
						const jsonFile = fs.readFileSync(fullFilePath);

						let resourceContent = JSON.parse(jsonFile.toString());
						resourceContent[resourceKey] = selectedText;
						
						let resourceStringJson = JSON.stringify(resourceContent, null, 2).replace(/(\{\n)|(\n})/g, '');
						resourceStringJson = resourceStringJson.split('\n').sort((a: string, b: string) => a.toLowerCase().localeCompare(b.toLowerCase())).join('\n');
						resourceStringJson = `{\n${resourceStringJson}\n}`;
						resourceStringJson = resourceStringJson.replace(/(?<=: ".+)"\n/gm, '",\n').replace(/,\n}/g, '\n}');

						fs.writeFileSync(fullFilePath, resourceStringJson);
					}
				});

				const fieldClassPath = `${treatSpearator(projectBasePath)}${fieldClassRelativePath}`;
				const globalClassPath = `${treatSpearator(projectBasePath)}${globalClassRelativePath}`;
				
				const hookNewConstant = (startPattern: string, filePath: string) => {
					let content = fs.readFileSync(filePath);
					let lines = content.toString().split('\n');
					let lastConstantIdx = -1;
					let breakLineAtStart = true;

					for (let i = lines.length - 1; i >= 0; i--) {
						if (lines[i].includes('public const string')) {
							lastConstantIdx = i;
							break;
						}
					}

					if (lastConstantIdx === -1) {
						for (let i = 0; i < lines.length; i++) {
							if (lines[i].includes("public class") && !lines[i].includes("{")) {
								if (lines[i + 1].includes("{")) {
									if (lines[i + 1].includes("}")) {
										lines[i + 1] = lines[i + 1].replace("}", "");
										const initialPart = lines.slice(0, i + 2);
										lines = [
											...initialPart,
											"",
											"    }",
											...lines.slice(i + 2, lines.length),
										];
										lastConstantIdx = i + 2;
										breakLineAtStart = false;
										break;
									}
						
									if (lines[i + 2].includes("}")) {
										const initialPart = lines.slice(0, i + 2);
										lines = [...initialPart, "", ...lines.slice(i + 2, lines.length)];
										lastConstantIdx = i + 2;
										breakLineAtStart = false;
										break;
									}
								}
							}
						}
					}

					const rawConstantName = resourceKey.replace(startPattern, '');

					let constantName = rawConstantName.split('_').reduce((acc, key) => {
						return acc + (key.charAt(0).toUpperCase() + key.slice(1, key.length));
					}, '');

					if (content.includes(constantName)) {
						const lineIdx = lines.findIndex(line => line.includes(constantName));
						const pattern = new RegExp(`${constantName} = ".+"`);
						lines[lineIdx] = lines[lineIdx].replace(pattern, `${constantName} = "${resourceKey}"`);
					} else {
						lines[lastConstantIdx] += `${breakLineAtStart ? '\n' : ''}        public const string ${constantName} = "${resourceKey}";`;
					}

					const modifiedContent = lines.join('\n');

					fs.writeFileSync(filePath, modifiedContent);

					const constantFilePathParts = filePath.split('/');
					const constantFileName = constantFilePathParts[constantFilePathParts.length - 1].replace('.cs', '');

					if (!selectedText.startsWith('"')) {
						selection = new vscode.Selection(
							new vscode.Position(selection.start.line, selection.start.character - 1),
							new vscode.Position(selection.end.line, selection.end.character + 1),
						);
					}

					editor.edit(editBuilder => {
						editBuilder.replace(selection, `${constantFileName}.${constantName}`);
					});
				};

				if (resourceKey.startsWith('str_f')) {
					if (!fs.existsSync(fieldClassPath)) {
						vscode.window.showWarningMessage(`Arquivo da config fieldClassRelativePath não existe ou não foi passado.`);
					} else {
						hookNewConstant('str_f_', fieldClassPath);
					}
				} else {
					if (!fs.existsSync(globalClassPath)) {
						vscode.window.showWarningMessage(`Arquivo da config globalClassRelativePath não existe ou não foi passado.`);
					} else {
						hookNewConstant('str_s_', globalClassPath);
					}
				}

				if (resourceKey) {
					const generatedResource = `${resourceKey} - ${selectedText}`;
					vscode.window.showInformationMessage(`Recurso gerado: ${generatedResource}`);
				} else {
					vscode.window.showInformationMessage('Nenhum texto fornecido. O recurso não foi gerado.');
				}
		}
	});

	context.subscriptions.push(disposable);

	vscode.languages.registerCodeActionsProvider('*', {
		provideCodeActions(document: vscode.TextDocument, range: vscode.Range) {
			const text = document.getText(range);
			const action = new vscode.CodeAction('Gerar recurso para o texto', vscode.CodeActionKind.QuickFix);
			action.command = { command: 'extension.generateResourceForText', title: 'Gerar recurso para o texto', tooltip: 'Este comando irá gerar um recurso para o texto selecionado', arguments: [text] };
			return [action];
		}
	});
}

// This method is called when your extension is deactivated
export function deactivate() {}
