package br.univates.medicalfield.clinico.seguranca;

import java.util.UUID;

/** Dados do profissional que vêm no token de acesso emitido pelo ms-auth. */
public record ProfissionalAutenticado(
        UUID id, UUID sessaoId, String nome, String tipoRegistro, String registro, String perfil) {

    public boolean administrador() {
        return "ADMIN".equals(perfil);
    }

    /** Ex.: "CRM 12345-RS". */
    public String registroCompleto() {
        return tipoRegistro + " " + registro;
    }
}
