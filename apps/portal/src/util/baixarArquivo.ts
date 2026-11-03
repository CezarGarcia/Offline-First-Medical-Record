/** Faz o navegador salvar um arquivo que veio da API (o PDF exige o token, então não dá para abrir um link). */
export function baixarArquivo(conteudo: Blob, nome: string): void {
  const endereco = URL.createObjectURL(conteudo);
  const link = document.createElement('a');
  link.href = endereco;
  link.download = nome;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // O navegador já copiou o arquivo; o endereço temporário pode ser liberado depois
  setTimeout(() => URL.revokeObjectURL(endereco), 60_000);
}
