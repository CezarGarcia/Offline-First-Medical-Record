package br.univates.medicalfield.clinico.atendimento;

import br.univates.medicalfield.clinico.atendimento.Atendimento.MedicamentoAdministrado;
import br.univates.medicalfield.clinico.comum.Banco;
import br.univates.medicalfield.clinico.comum.Origem;
import br.univates.medicalfield.clinico.pessoa.Pessoa;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Padrão Repository: todo o SQL de clinico.atendimento e clinico.atendimento_medicamento fica aqui. */
@Repository
public class RepositorioAtendimentos {

    private final JdbcClient jdbc;

    public RepositorioAtendimentos(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public record NovoAtendimento(UUID id, UUID prontuarioId, AtendimentoEntrada dados, Origem origem, UUID sincronizadoPorId) {
    }

    /** Insere se o ID ainda não existir. Devolve 1 se inseriu, 0 se já existia. */
    public int inserir(NovoAtendimento a) {
        AtendimentoEntrada d = a.dados();
        AtendimentoEntrada.Glasgow g = d.glasgow();
        AtendimentoEntrada.SinaisVitais s = d.sinaisVitais() != null ? d.sinaisVitais()
                : new AtendimentoEntrada.SinaisVitais(null, null, null, null, null, null, null);
        Origem o = a.origem();
        return jdbc.sql("""
                INSERT INTO clinico.atendimento
                  (id, prontuario_id, data_hora, local_ocorrencia, tipo_ocorrencia, queixa_principal,
                   triagem_protocolo, triagem_cor, glasgow_ocular, glasgow_verbal, glasgow_motora,
                   pa_sistolica, pa_diastolica, freq_cardiaca, freq_respiratoria, spo2, temperatura, glicemia,
                   procedimentos, desfecho, destino, observacoes,
                   criado_por_id, criado_por_nome, criado_por_registro, criado_em, dispositivo_id, dispositivo_nome,
                   modo_registro, sincronizado_por_id)
                VALUES
                  (:id, :prontuarioId, :dataHora, :local, :tipo, :queixa,
                   :protocolo, :cor, :ocular, :verbal, :motora,
                   :paSistolica, :paDiastolica, :fc, :fr, :spo2, :temperatura, :glicemia,
                   :procedimentos, :desfecho, :destino, :observacoes,
                   :criadoPorId, :criadoPorNome, :criadoPorRegistro, :criadoEm, :dispositivoId, :dispositivoNome,
                   :modo, :sincronizadoPorId)
                ON CONFLICT (id) DO NOTHING
                """)
                .param("id", a.id())
                .param("prontuarioId", a.prontuarioId())
                .param("dataHora", Banco.utc(d.dataHora().toInstant()))
                .param("local", Banco.limpar(d.localOcorrencia()))
                .param("tipo", d.tipoOcorrencia())
                .param("queixa", Banco.limpar(d.queixaPrincipal()))
                .param("protocolo", d.triagem().protocolo())
                .param("cor", d.triagem().cor())
                .param("ocular", g == null ? null : g.ocular())
                .param("verbal", g == null ? null : g.verbal())
                .param("motora", g == null ? null : g.motora())
                .param("paSistolica", s.paSistolica())
                .param("paDiastolica", s.paDiastolica())
                .param("fc", s.frequenciaCardiaca())
                .param("fr", s.frequenciaRespiratoria())
                .param("spo2", s.spo2())
                .param("temperatura", s.temperatura())
                .param("glicemia", s.glicemia())
                .param("procedimentos", Banco.limpar(d.procedimentos()))
                .param("desfecho", d.desfecho().tipo())
                .param("destino", Banco.limpar(d.desfecho().destino()))
                .param("observacoes", Banco.limpar(d.observacoes()))
                .param("criadoPorId", o.criadoPorId())
                .param("criadoPorNome", o.criadoPorNome())
                .param("criadoPorRegistro", o.criadoPorRegistro())
                .param("criadoEm", Banco.utc(o.criadoEm()))
                .param("dispositivoId", o.dispositivoId())
                .param("dispositivoNome", o.dispositivoNome())
                .param("modo", o.modo())
                .param("sincronizadoPorId", a.sincronizadoPorId())
                .update();
    }

    public void inserirMedicamento(UUID atendimentoId, UUID itemId, AtendimentoEntrada.MedicamentoAdministrado m) {
        jdbc.sql("""
                INSERT INTO clinico.atendimento_medicamento
                  (id, atendimento_id, medicamento_id, dose, unidade, via, horario, observacao)
                VALUES (:id, :atendimento, :medicamento, :dose, :unidade, :via, :horario, :observacao)
                """)
                .param("id", itemId)
                .param("atendimento", atendimentoId)
                .param("medicamento", m.medicamentoId())
                .param("dose", m.dose())
                .param("unidade", m.unidade())
                .param("via", m.via())
                .param("horario", Banco.utc(m.horario().toInstant()))
                .param("observacao", Banco.limpar(m.observacao()))
                .update();
    }

    public boolean existe(UUID id) {
        return jdbc.sql("SELECT EXISTS (SELECT 1 FROM clinico.atendimento WHERE id = :id)")
                .param("id", id)
                .query(Boolean.class)
                .single();
    }

    public Optional<Atendimento> buscar(UUID id) {
        return jdbc.sql("SELECT * FROM clinico.atendimento WHERE id = :id")
                .param("id", id)
                .query(RepositorioAtendimentos::mapear)
                .optional()
                .map(a -> a.comMedicamentos(medicamentosDe(List.of(a.id())).getOrDefault(a.id(), List.of())));
    }

    public List<Atendimento> listarDaPessoa(UUID pessoaId) {
        return comMedicamentos(jdbc.sql("""
                SELECT a.* FROM clinico.atendimento a
                  JOIN clinico.prontuario pr ON pr.id = a.prontuario_id
                 WHERE pr.pessoa_id = :pessoaId
                 ORDER BY a.data_hora DESC, a.id DESC
                """)
                .param("pessoaId", pessoaId)
                .query(RepositorioAtendimentos::mapear)
                .list());
    }

    public List<Atendimento> alteradosDesde(Instant limite) {
        return comMedicamentos(jdbc.sql("SELECT * FROM clinico.atendimento WHERE atualizado_em > :limite ORDER BY atualizado_em")
                .param("limite", Banco.utc(limite))
                .query(RepositorioAtendimentos::mapear)
                .list());
    }

    /** Todos os atendimentos, do mais recente para o mais antigo, com o resumo da pessoa. */
    public List<Atendimento.Resumo> listarResumo() {
        return jdbc.sql("""
                SELECT a.*, pe.id AS pessoa_id, pe.nome AS pessoa_nome, pe.cpf AS pessoa_cpf
                  FROM clinico.atendimento a
                  JOIN clinico.prontuario pr ON pr.id = a.prontuario_id
                  JOIN clinico.pessoa pe ON pe.id = pr.pessoa_id
                 ORDER BY a.data_hora DESC, a.id DESC
                """)
                .query((rs, n) -> new Atendimento.Resumo(
                        Banco.uuid(rs, "id"),
                        Banco.instante(rs, "data_hora"),
                        new Pessoa.Resumo(Banco.uuid(rs, "pessoa_id"), rs.getString("pessoa_nome"), rs.getString("pessoa_cpf")),
                        rs.getString("tipo_ocorrencia"),
                        new Atendimento.Triagem(rs.getString("triagem_protocolo"), rs.getString("triagem_cor")),
                        new Atendimento.Desfecho(rs.getString("desfecho"), rs.getString("destino")),
                        Banco.origem(rs),
                        Banco.sincronizacao(rs)))
                .list();
    }

    private List<Atendimento> comMedicamentos(List<Atendimento> atendimentos) {
        Map<UUID, List<MedicamentoAdministrado>> itens = medicamentosDe(atendimentos.stream().map(Atendimento::id).toList());
        return atendimentos.stream().map(a -> a.comMedicamentos(itens.getOrDefault(a.id(), List.of()))).toList();
    }

    private Map<UUID, List<MedicamentoAdministrado>> medicamentosDe(Collection<UUID> atendimentos) {
        Map<UUID, List<MedicamentoAdministrado>> porAtendimento = new HashMap<>();
        if (atendimentos.isEmpty()) {
            return porAtendimento;
        }
        jdbc.sql("""
                SELECT am.*, m.nome FROM clinico.atendimento_medicamento am
                  JOIN clinico.medicamento m ON m.id = am.medicamento_id
                 WHERE am.atendimento_id IN (:ids)
                 ORDER BY am.horario, am.id
                """)
                .param("ids", atendimentos)
                .query(rs -> {
                    porAtendimento.computeIfAbsent(Banco.uuid(rs, "atendimento_id"), id -> new ArrayList<>())
                            .add(new MedicamentoAdministrado(
                                    Banco.uuid(rs, "id"),
                                    Banco.uuid(rs, "medicamento_id"),
                                    rs.getString("nome"),
                                    Banco.decimal(rs, "dose"),
                                    rs.getString("unidade"),
                                    rs.getString("via"),
                                    Banco.instante(rs, "horario"),
                                    rs.getString("observacao")));
                });
        return porAtendimento;
    }

    static Atendimento mapear(ResultSet rs, int linha) throws SQLException {
        Integer ocular = Banco.inteiro(rs, "glasgow_ocular");
        return new Atendimento(
                Banco.uuid(rs, "id"),
                Banco.uuid(rs, "prontuario_id"),
                Banco.instante(rs, "data_hora"),
                rs.getString("local_ocorrencia"),
                rs.getString("tipo_ocorrencia"),
                rs.getString("queixa_principal"),
                new Atendimento.Triagem(rs.getString("triagem_protocolo"), rs.getString("triagem_cor")),
                ocular == null ? null : new Atendimento.Glasgow(ocular, Banco.inteiro(rs, "glasgow_verbal"),
                        Banco.inteiro(rs, "glasgow_motora"), Banco.inteiro(rs, "glasgow_total")),
                new Atendimento.SinaisVitais(
                        Banco.inteiro(rs, "pa_sistolica"),
                        Banco.inteiro(rs, "pa_diastolica"),
                        Banco.inteiro(rs, "freq_cardiaca"),
                        Banco.inteiro(rs, "freq_respiratoria"),
                        Banco.inteiro(rs, "spo2"),
                        Banco.decimal(rs, "temperatura"),
                        Banco.inteiro(rs, "glicemia")),
                List.of(),
                rs.getString("procedimentos"),
                new Atendimento.Desfecho(rs.getString("desfecho"), rs.getString("destino")),
                rs.getString("observacoes"),
                Banco.origem(rs),
                Banco.sincronizacao(rs),
                null,
                null);
    }
}
