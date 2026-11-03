package br.univates.medicalfield.clinico.erros;

/** Um campo com problema, dentro de uma resposta de erro. */
public record Detalhe(String campo, String mensagem) {
}
