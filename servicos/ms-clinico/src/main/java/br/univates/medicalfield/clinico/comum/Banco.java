package br.univates.medicalfield.clinico.comum;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

/** Conversões entre Java e as colunas do Postgres (datas em UTC). */
public final class Banco {

    private Banco() {
    }

    /** O driver do Postgres aceita OffsetDateTime (não Instant) como parâmetro. */
    public static OffsetDateTime utc(Instant instante) {
        return instante == null ? null : OffsetDateTime.ofInstant(instante, ZoneOffset.UTC);
    }

    public static Instant instante(ResultSet rs, String coluna) throws SQLException {
        OffsetDateTime valor = rs.getObject(coluna, OffsetDateTime.class);
        return valor == null ? null : valor.toInstant();
    }

    public static UUID uuid(ResultSet rs, String coluna) throws SQLException {
        return rs.getObject(coluna, UUID.class);
    }

    public static LocalDate data(ResultSet rs, String coluna) throws SQLException {
        return rs.getObject(coluna, LocalDate.class);
    }

    public static Integer inteiro(ResultSet rs, String coluna) throws SQLException {
        int valor = rs.getInt(coluna);
        return rs.wasNull() ? null : valor;
    }

    public static Double decimal(ResultSet rs, String coluna) throws SQLException {
        BigDecimal valor = rs.getBigDecimal(coluna);
        return valor == null ? null : valor.doubleValue();
    }

    /** Texto vazio ou só com espaços vira null; o resto perde os espaços das pontas. */
    public static String limpar(String texto) {
        if (texto == null) {
            return null;
        }
        String limpo = texto.strip();
        return limpo.isEmpty() ? null : limpo;
    }

    public static Origem origem(ResultSet rs) throws SQLException {
        return new Origem(
                uuid(rs, "criado_por_id"),
                rs.getString("criado_por_nome"),
                rs.getString("criado_por_registro"),
                instante(rs, "criado_em"),
                uuid(rs, "dispositivo_id"),
                rs.getString("dispositivo_nome"),
                rs.getString("modo_registro"));
    }

    public static Sincronizacao sincronizacao(ResultSet rs) throws SQLException {
        return new Sincronizacao(uuid(rs, "sincronizado_por_id"), instante(rs, "recebido_em"), instante(rs, "atualizado_em"));
    }
}
