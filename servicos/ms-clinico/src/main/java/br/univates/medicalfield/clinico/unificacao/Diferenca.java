package br.univates.medicalfield.clinico.unificacao;

/**
 * Um campo que diferia entre o registro mantido e o duplicado.
 *
 * @param tipo CONFLITO (os dois preenchidos e diferentes) ou COMPLEMENTO (só o recebido estava preenchido)
 * @param origemDoValor de onde veio o valor que ficou: EXISTENTE ou RECEBIDO
 */
public record Diferenca(String campo, String tipo, String valorMantido, String valorDescartado, String origemDoValor) {
}
