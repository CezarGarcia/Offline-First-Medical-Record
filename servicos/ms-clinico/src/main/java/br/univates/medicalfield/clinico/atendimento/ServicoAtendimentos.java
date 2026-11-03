package br.univates.medicalfield.clinico.atendimento;

import br.univates.medicalfield.clinico.comum.Autor;
import br.univates.medicalfield.clinico.comum.Origem;
import br.univates.medicalfield.clinico.comum.ResultadoCadastro;
import br.univates.medicalfield.clinico.comum.Uuids;
import br.univates.medicalfield.clinico.comum.Valores;
import br.univates.medicalfield.clinico.comum.Verificacao;
import br.univates.medicalfield.clinico.erros.ErroApi;
import br.univates.medicalfield.clinico.medicamento.RepositorioMedicamentos;
import br.univates.medicalfield.clinico.pessoa.Pessoa;
import br.univates.medicalfield.clinico.pessoa.RepositorioPessoas;
import br.univates.medicalfield.clinico.prontuario.Prontuario;
import br.univates.medicalfield.clinico.prontuario.RepositorioProntuarios;
import br.univates.medicalfield.clinico.unificacao.RepositorioUnificacoes;
import java.time.Instant;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Cadastro e consulta de atendimentos. Atendimento nunca é unificado: dois são sempre dois. */
@Service
public class ServicoAtendimentos {

    private final RepositorioAtendimentos atendimentos;
    private final RepositorioProntuarios prontuarios;
    private final RepositorioPessoas pessoas;
    private final RepositorioMedicamentos medicamentos;
    private final RepositorioUnificacoes unificacoes;

    public ServicoAtendimentos(RepositorioAtendimentos atendimentos, RepositorioProntuarios prontuarios,
                               RepositorioPessoas pessoas, RepositorioMedicamentos medicamentos,
                               RepositorioUnificacoes unificacoes) {
        this.atendimentos = atendimentos;
        this.prontuarios = prontuarios;
        this.pessoas = pessoas;
        this.medicamentos = medicamentos;
        this.unificacoes = unificacoes;
    }

    public List<Atendimento.Resumo> listar() {
        return atendimentos.listarResumo();
    }

    /** Atendimentos de uma pessoa ({@code pessoaId} pode ser um ID descartado numa unificação). */
    @Transactional(readOnly = true)
    public List<Atendimento> daPessoa(UUID pessoaId) {
        UUID id = unificacoes.resolver(pessoaId, RepositorioUnificacoes.PESSOA);
        if (!pessoas.existe(id)) {
            throw ErroApi.naoEncontrado("Pessoa não encontrada.");
        }
        return atendimentos.listarDaPessoa(id);
    }

    /** Um atendimento completo, com pessoa e prontuário (é o que o ms-docs usa para o PDF). */
    @Transactional(readOnly = true)
    public Atendimento detalhe(UUID id) {
        Atendimento atendimento = atendimentos.buscar(id)
                .orElseThrow(() -> ErroApi.naoEncontrado("Atendimento não encontrado."));
        Prontuario prontuario = prontuarios.buscar(atendimento.prontuarioId()).orElseThrow();
        Pessoa pessoa = pessoas.buscar(prontuario.pessoaId()).orElseThrow();
        return atendimento.comDetalhes(pessoa, prontuario);
    }

    @Transactional
    public ResultadoCadastro<Atendimento> cadastrar(AtendimentoEntrada entrada, Autor autor) {
        Instant agora = Instant.now();
        Verificacao verificacao = new Verificacao();
        Origem origem = autor.origemPara(entrada.origem(), agora, verificacao);
        verificarRegras(entrada, agora, verificacao);
        verificacao.lancarSeHouverErros();
        UUID id = entrada.id() != null ? entrada.id() : Uuids.v7();

        // Reenvio do mesmo ID (idempotência: o primeiro envio vale)
        Optional<Atendimento> existente = atendimentos.buscar(id);
        if (existente.isPresent()) {
            return ResultadoCadastro.jaExistia(id, existente.get());
        }

        UUID prontuarioId = unificacoes.resolver(entrada.prontuarioId(), RepositorioUnificacoes.PRONTUARIO);
        if (!prontuarios.existe(prontuarioId)) {
            throw ErroApi.referencia("PRONTUARIO_NAO_ENCONTRADO", "O prontuário " + entrada.prontuarioId() + " não existe.");
        }
        List<AtendimentoEntrada.MedicamentoAdministrado> itens =
                entrada.medicamentos() != null ? entrada.medicamentos() : List.of();
        Set<UUID> pedidos = itens.stream().map(AtendimentoEntrada.MedicamentoAdministrado::medicamentoId)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        Set<UUID> faltando = new LinkedHashSet<>(pedidos);
        faltando.removeAll(medicamentos.existentes(pedidos));
        if (!faltando.isEmpty()) {
            throw ErroApi.referencia("MEDICAMENTO_NAO_ENCONTRADO", "Medicamento(s) inexistente(s) no catálogo: " + faltando);
        }

        int inseridos = atendimentos.inserir(new RepositorioAtendimentos.NovoAtendimento(
                id, prontuarioId, entrada, origem, autor.profissional().id()));
        if (inseridos == 0) {
            return ResultadoCadastro.jaExistia(id, atendimentos.buscar(id).orElseThrow());
        }
        for (AtendimentoEntrada.MedicamentoAdministrado item : itens) {
            atendimentos.inserirMedicamento(id, item.id() != null ? item.id() : Uuids.v7(), item);
        }
        return ResultadoCadastro.criado(id, atendimentos.buscar(id).orElseThrow());
    }

    /** Regras que envolvem mais de um campo (as simples estão nas anotações da entrada). */
    private static void verificarRegras(AtendimentoEntrada entrada, Instant agora, Verificacao verificacao) {
        AtendimentoEntrada.Triagem triagem = entrada.triagem();
        List<String> cores = Valores.CORES_POR_PROTOCOLO.get(triagem.protocolo());
        if (cores != null && triagem.cor() != null) {
            verificacao.exigir(cores.contains(triagem.cor()), "triagem.cor",
                    "cor não existe no protocolo " + triagem.protocolo() + " (use: " + String.join(", ", cores) + ")");
        }
        AtendimentoEntrada.Desfecho desfecho = entrada.desfecho();
        verificacao.exigir(!"ENCAMINHADO_HOSPITAL".equals(desfecho.tipo())
                        || (desfecho.destino() != null && !desfecho.destino().isBlank()),
                "desfecho.destino", "campo obrigatório quando o desfecho é ENCAMINHADO_HOSPITAL");
        verificacao.naoNoFuturo("dataHora", entrada.dataHora().toInstant(), agora);

        List<AtendimentoEntrada.MedicamentoAdministrado> itens =
                entrada.medicamentos() != null ? entrada.medicamentos() : List.of();
        Set<UUID> idsDosItens = new HashSet<>();
        for (int i = 0; i < itens.size(); i++) {
            AtendimentoEntrada.MedicamentoAdministrado item = itens.get(i);
            verificacao.naoNoFuturo("medicamentos." + i + ".horario", item.horario().toInstant(), agora);
            verificacao.exigir(item.id() == null || idsDosItens.add(item.id()), "medicamentos." + i + ".id",
                    "id repetido na lista de medicamentos");
        }
    }
}
